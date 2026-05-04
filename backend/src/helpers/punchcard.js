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

// ── Read punch target from DB (falls back to env, then 10) ──
function getPunchTarget() {
  try {
    const row = db.prepare("SELECT value FROM payment_config WHERE key = 'punch_target'").get();
    if (row?.value) return parseInt(row.value);
  } catch(e) { /* table may not have this key yet */ }
  return parseInt(process.env.PUNCH_TARGET || '10');
}

// ── Generate a unique voucher code ───────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand  = (n) => Array.from({ length: n }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `MW-${rand(4)}-${rand(4)}`;
}

// ── Get user's most purchased package (paid sessions only) ──
function getMostPurchasedPackage(userId) {
  return db.prepare(`
    SELECT package_id, COUNT(*) as cnt
    FROM sessions
    WHERE user_id = ?
      AND payment_method IN ('mpesa', 'kopokopo')
      AND status != 'terminated'
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

  const PUNCH_TARGET = getPunchTarget();

  // Count only paid sessions for the punch cycle — free/punchcard sessions
  // do NOT count toward the next milestone (prevents cycle corruption)
  const paidRow = db.prepare(`
    SELECT COUNT(*) as cnt FROM sessions
    WHERE user_id = ?
      AND payment_method IN ('mpesa', 'kopokopo')
      AND status != 'terminated'
  `).get(userId);
  const paidSessions     = paidRow?.cnt || 0;
  const sessionsIntoCycle = paidSessions % PUNCH_TARGET;
  const sessionsLeft      = sessionsIntoCycle === 0
    ? 0
    : PUNCH_TARGET - sessionsIntoCycle;

  // ── Milestone reached ────────────────────────────────────
  if (sessionsIntoCycle === 0 && paidSessions > 0) {
    // Guard: check we haven't already issued a voucher for this exact milestone
    const milestoneNumber = Math.floor(paidSessions / PUNCH_TARGET);
    const alreadyIssued = db.prepare(`
      SELECT id FROM vouchers
      WHERE created_for_user_id = ?
        AND punchcard_milestone = ?
    `).get(userId, milestoneNumber);

    if (!alreadyIssued) {
      await handleMilestone(user, phone, PUNCH_TARGET, milestoneNumber);
    }
    return;
  }

  // ── Progress reminder ────────────────────────────────────
  await sendProgressSms(user, phone, sessionsLeft, PUNCH_TARGET);
}

// ── Handle milestone: generate voucher + send SMS ─────────
async function handleMilestone(user, phone, PUNCH_TARGET, milestoneNumber) {
  try {
    // Find most purchased package (paid sessions only)
    const topPkg = getMostPurchasedPackage(user.id);
    if (!topPkg) {
      console.warn(`Punchcard milestone: no paid package found for user ${user.id}`);
      return;
    }

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND is_active = 1').get(topPkg.package_id);
    if (!pkg) {
      console.warn(`Punchcard milestone: package ${topPkg.package_id} not found/inactive for user ${user.id}`);
      return;
    }

    // Generate unique voucher code
    let code;
    let attempts = 0;
    do {
      code = generateCode();
      attempts++;
      if (attempts > 20) throw new Error('Could not generate unique voucher code after 20 attempts');
    } while (db.prepare('SELECT id FROM vouchers WHERE code = ?').get(code));

    // Set expiry 7 days from now
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Insert free voucher — tag with user + milestone so we can guard against duplicates.
    // NOTE: If your vouchers table doesn't yet have created_for_user_id / punchcard_milestone
    // columns, run this migration once:
    //   ALTER TABLE vouchers ADD COLUMN created_for_user_id INTEGER REFERENCES users(id);
    //   ALTER TABLE vouchers ADD COLUMN punchcard_milestone INTEGER;
    db.prepare(`
      INSERT INTO vouchers (code, package_id, site_id, expires_at, created_for_user_id, punchcard_milestone)
      VALUES (?, ?, (SELECT id FROM sites LIMIT 1), ?, ?, ?)
    `).run(code, pkg.id, expiresAt, user.id, milestoneNumber);

    // Reset punch_count so the frontend dots reset correctly
    db.prepare(`UPDATE users SET punch_count = 0 WHERE id = ?`).run(user.id);

    console.log(`🎉 Punchcard milestone #${milestoneNumber}! Free voucher ${code} generated for user ${user.id} (${phone})`);

    // Send congratulatory SMS
    const tmpl = db.prepare(
      "SELECT * FROM sms_templates WHERE name = 'punchcard_milestone' AND is_active = 1"
    ).get();

    const message = tmpl
      ? fillTemplate(tmpl.content, {
          company:  'Monarch Wireless',
          package:  pkg.name,
          code,
          expiry:   new Date(expiresAt).toLocaleDateString('en-KE'),
          sessions: PUNCH_TARGET * milestoneNumber,
          target:   PUNCH_TARGET,
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
    console.error(`Punchcard milestone error for user ${user.id}:`, e.message, e.stack);
  }
}

// ── Progress SMS ─────────────────────────────────────────────
async function sendProgressSms(user, phone, sessionsLeft, PUNCH_TARGET) {
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

module.exports = { checkPunchcard, getPunchTarget };