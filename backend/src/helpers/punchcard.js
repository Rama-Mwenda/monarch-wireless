/**
 * punchcard.js
 * Handles punch card milestone detection, free voucher generation,
 * and SMS notifications. Called after every session is created.
 *
 * Logic:
 *   - Every PUNCH_TARGET sessions = 1 free session
 *   - On milestone: generate a voucher for user's most purchased package
 *   - Send congratulatory SMS with the voucher code
 *   - On non-milestone sessions: send "X sessions to go" SMS reminder
 */

const db  = require('../db');
const sms = require('../services/sms');

const PUNCH_TARGET = parseInt(process.env.PUNCH_TARGET || '10');

// ── Generate a unique voucher code ───────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand  = (n) => Array.from({ length: n }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `MW-${rand(4)}-${rand(4)}`;
}

// ── Get user's most purchased package ───────────────────────
function getMostPurchasedPackage(userId) {
  return db.prepare(`
    SELECT package_id, COUNT(*) as cnt
    FROM sessions
    WHERE user_id = ? AND payment_method IN ('mpesa', 'kopokopo', 'voucher')
    GROUP BY package_id
    ORDER BY cnt DESC
    LIMIT 1
  `).get(userId);
}

// ── Main punchcard check ─────────────────────────────────────
async function checkPunchcard(userId, phone) {
  if (!phone || phone.startsWith('mac:')) return;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const totalSessions = user.total_sessions;
  const sessionsIntoCycle = totalSessions % PUNCH_TARGET;
  const sessionsLeft = sessionsIntoCycle === 0
    ? 0   // just hit milestone
    : PUNCH_TARGET - sessionsIntoCycle;

  // ── Milestone reached ────────────────────────────────────
  if (sessionsIntoCycle === 0 && totalSessions > 0) {
    await handleMilestone(user, phone);
    return;
  }

  // ── Progress reminder ────────────────────────────────────
  await sendProgressSms(user, phone, sessionsLeft);
}

// ── Handle milestone: generate voucher + send SMS ─────────
async function handleMilestone(user, phone) {
  try {
    // Find most purchased package
    const topPkg = getMostPurchasedPackage(user.id);
    if (!topPkg) return;

    const pkg  = db.prepare('SELECT * FROM packages WHERE id = ? AND is_active = 1').get(topPkg.package_id);
    if (!pkg) return;

    // Generate unique voucher code
    let code;
    do { code = generateCode(); }
    while (db.prepare('SELECT id FROM vouchers WHERE code = ?').get(code));

    // Set expiry 7 days from now
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Insert free voucher
    db.prepare(`
      INSERT INTO vouchers (code, package_id, site_id, expires_at)
      VALUES (?, ?, (SELECT id FROM sites LIMIT 1), ?)
    `).run(code, pkg.id, expiresAt);

    console.log(`🎉 Punchcard milestone! Free voucher ${code} generated for ${phone}`);

    // Send congratulatory SMS
    const tmpl = db.prepare(
      "SELECT * FROM sms_templates WHERE name = 'punchcard_milestone' AND is_active = 1"
    ).get();

    const message = tmpl
      ? fillTemplate(tmpl.content, {
          company:   'Monarch Wireless',
          package:   pkg.name,
          code,
          expiry:    new Date(expiresAt).toLocaleDateString('en-KE'),
          sessions:  user.total_sessions,
          target:    PUNCH_TARGET,
        })
      : `🎉 Congratulations! You've completed ${PUNCH_TARGET} sessions on Monarch Wireless! ` +
        `You've earned a FREE ${pkg.name} session. Your voucher code: ${code}. ` +
        `Valid for 7 days. Enjoy! 🌐`;

    await sms.sendAndLog({
      userId:      user.id,
      phone,
      messageType: 'punchcard_milestone',
      message,
    });

  } catch(e) {
    console.error('Punchcard milestone error:', e.message);
  }
}

// ── Progress SMS ─────────────────────────────────────────────
async function sendProgressSms(user, phone, sessionsLeft) {
  try {
    const tmpl = db.prepare(
      "SELECT * FROM sms_templates WHERE name = 'punchcard_progress' AND is_active = 1"
    ).get();

    if (!tmpl) return; // Only send if template is active

    const message = fillTemplate(tmpl.content, {
      company:      'Monarch Wireless',
      sessions_left: sessionsLeft,
      total:        user.total_sessions,
      target:       PUNCH_TARGET,
    });

    await sms.sendAndLog({
      userId:      user.id,
      phone,
      messageType: 'punchcard_progress',
      message,
    });

  } catch(e) {
    console.error('Punchcard progress SMS error:', e.message);
  }
}

function fillTemplate(content, vars) {
  return content.replace(/\[\[(\w+)\]\]/g, (_, key) => vars[key] ?? '');
}

module.exports = { checkPunchcard, PUNCH_TARGET };