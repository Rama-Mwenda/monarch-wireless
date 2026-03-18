/**
 * session-expiry.js
 * Cron job — runs every 60 seconds.
 * Finds active sessions past their end_at, marks them expired,
 * deauthorizes MAC from Omada, sends expiry SMS.
 */

const db       = require('../db');
const omada    = require('../services/omada');
const sms      = require('../services/sms');

const INTERVAL_MS = 60 * 1000; // every 60 seconds

async function runExpiryCheck() {
  try {
    // Find all active sessions that have passed end_at
    const expired = db.prepare(`
      SELECT s.*, u.phone, u.opted_in_sms,
             p.name as package_name
      FROM sessions s
      JOIN users u    ON s.user_id    = u.id
      JOIN packages p ON s.package_id = p.id
      WHERE s.status = 'active'
        AND datetime(s.end_at) <= datetime('now')
    `).all();

    if (!expired.length) return;

    console.log(`⏰ Session expiry check: ${expired.length} session(s) to expire`);

    for (const session of expired) {
      try {
        // 1. Mark session expired
        db.prepare(`
          UPDATE sessions SET status = 'expired' WHERE id = ?
        `).run(session.id);

        // 2. Deauthorize MAC from Omada (non-blocking per session)
        if (session.client_mac) {
          omada.deauthorizeClient(session.client_mac)
            .catch(e => console.error(`Omada deauth error for ${session.client_mac}:`, e.message));
        }

        // 3. Send expiry SMS (only real phone numbers, only if opted in)
        if (session.phone && !session.phone.startsWith('mac:') && session.opted_in_sms) {
          sms.sessionExpired({
            userId:      session.user_id,
            phone:       session.phone,
            packageName: session.package_name,
          }).catch(e => console.error('Expiry SMS error:', e.message));
        }

        console.log(`✅ Expired session ${session.id} — ${session.phone} — ${session.package_name}`);

      } catch(e) {
        console.error(`Error expiring session ${session.id}:`, e.message);
      }
    }

  } catch(e) {
    console.error('Session expiry cron error:', e.message);
  }
}

// ── Also check for sessions expiring soon (10 min warning) ──
async function runExpiringSoonCheck() {
  try {
    const expiringSoon = db.prepare(`
      SELECT s.*, u.phone, u.opted_in_sms,
             p.name as package_name
      FROM sessions s
      JOIN users u    ON s.user_id    = u.id
      JOIN packages p ON s.package_id = p.id
      WHERE s.status = 'active'
        AND datetime(s.end_at)  > datetime('now')
        AND datetime(s.end_at) <= datetime('now', '+10 minutes')
        AND s.warned_expiry = 0
    `).all();

    for (const session of expiringSoon) {
      try {
        // Mark warned so we don't double-send
        db.prepare('UPDATE sessions SET warned_expiry = 1 WHERE id = ?').run(session.id);

        if (session.phone && !session.phone.startsWith('mac:') && session.opted_in_sms) {
          sms.sessionExpiringSoon({
            userId:      session.user_id,
            phone:       session.phone,
            packageName: session.package_name,
            minutesLeft: 10,
          }).catch(e => console.error('Expiring soon SMS error:', e.message));
        }
      } catch(e) {
        console.error(`Error warning session ${session.id}:`, e.message);
      }
    }
  } catch(e) {
    // warned_expiry column may not exist yet — handled by safeAlter in db/index.js
  }
}

function start() {
  console.log('⏰ Session expiry cron started (60s interval)');

  // Run immediately on start
  runExpiryCheck();
  runExpiringSoonCheck();

  // Then every 60 seconds
  setInterval(() => {
    runExpiryCheck();
    runExpiringSoonCheck();
  }, INTERVAL_MS);
}

module.exports = { start };