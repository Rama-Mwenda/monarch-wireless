/**
 * mac-auth-helper.js
 * Shared logic for device limit enforcement + Omada MAC authorization.
 * Used by both mpesa.js route and portal.js route after a session is created.
 */

const db    = require('../db');
const omada = require('../services/omada');

/**
 * After a session is created, authorize the MAC with Omada
 * and enforce the package device limit.
 *
 * @param {object} opts
 *   sessionId       - the newly created session id
 *   userId          - user id
 *   packageId       - package id
 *   clientMac       - MAC from ?mac= portal param (may be null)
 *   apMac           - AP MAC from ?apMac= portal param
 *   ssidName        - SSID from ?ssidName= portal param
 *   radioId         - radio id from ?radioId= portal param
 *   site            - site name from ?site= portal param
 *   durationMinutes - package duration
 */
async function authorizeSession({
  sessionId, userId, packageId,
  clientMac, apMac, ssidName, radioId, site,
  durationMinutes,
}) {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(packageId);
  if (!pkg) return { success: false, reason: 'package_not_found' };

  const deviceLimit = pkg.device_limit || 1;

  // ── Device limit check (Monarch-side) ───────────────────────
  if (deviceLimit > 0 && clientMac) {
    const activeSessions = db.prepare(`
      SELECT COUNT(*) as cnt FROM sessions
      WHERE user_id = ? AND status = 'active'
      AND end_at > datetime('now')
      AND id != ?
    `).get(userId, sessionId);

    if (activeSessions.cnt >= deviceLimit) {
      // Mark this session as terminated immediately
      db.prepare(`UPDATE sessions SET status='terminated', terminated_at=datetime('now') WHERE id=?`)
        .run(sessionId);
      return {
        success:  false,
        reason:   'device_limit_exceeded',
        limit:    deviceLimit,
        active:   activeSessions.cnt,
      };
    }
  }

  // ── Omada MAC authorization ─────────────────────────────────
  let omadaResult = { success: false, skipped: true };

  if (clientMac) {
    omadaResult = await omada.authorizeClient({
      clientMac,
      apMac,
      ssidName,
      radioId,
      site,
      durationMinutes,
    });

    // Record auth result on session
    db.prepare(`
      UPDATE sessions SET
        client_mac         = ?,
        ap_mac             = ?,
        ssid_name          = ?,
        omada_authed       = ?,
        omada_auth_method  = ?
      WHERE id = ?
    `).run(
      omada.normaliseMac(clientMac),
      apMac    || null,
      ssidName || null,
      omadaResult.success ? 1 : 0,
      omadaResult.method  || null,
      sessionId
    );
  }

  return {
    success:     true,
    omada:       omadaResult,
    deviceLimit,
  };
}

/**
 * When a session expires or is terminated, deauthorize the MAC.
 * Call this from your session expiry job.
 */
async function deauthorizeSession(sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session?.client_mac) return;
  await omada.deauthorizeClient(session.client_mac);
}

module.exports = { authorizeSession, deauthorizeSession };
