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

  // ── Device limit check (per MAC, not per user) ──────────────────
  // Counts active sessions for this specific device only.
  // This allows a user to pay for multiple devices using the same phone number.
  if (deviceLimit > 0 && clientMac) {
    const normMac = omada.normaliseMac(clientMac);
    const activeSessions = db.prepare(`
      SELECT COUNT(*) as cnt FROM sessions
      WHERE client_mac = ? AND status = 'active'
      AND end_at > datetime('now')
      AND id != ?
    `).get(normMac, sessionId);

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


/**
 * Called when a client associates with a NEW AP but already has a valid session.
 * Re-authorizes them with Omada on the new AP WITHOUT modifying the session's
 * ap_mac (preserving revenue attribution to the originating host).
 *
 * @param {object} opts
 *   clientMac  - client device MAC
 *   newApMac   - the AP they've just roamed onto
 *   ssidName   - SSID name
 *   radioId    - radio id
 *   site       - Omada site name
 * @returns { found, success, sessionId, remainingMinutes }
 */
async function reauthorizeRoamingSession({
  clientMac, newApMac, ssidName, radioId, site,
}) {
  const normMac = omada.normaliseMac(clientMac);

  // Find an active, unexpired session for this device
  // NOTE: we do NOT filter by ap_mac — intentional, this is the roaming check
  const session = db.prepare(`
    SELECT s.*, p.duration_minutes, p.device_limit
    FROM sessions s
    JOIN packages p ON s.package_id = p.id
    WHERE s.client_mac = ?
      AND s.status = 'active'
      AND s.end_at > datetime('now')
    ORDER BY s.end_at DESC
    LIMIT 1
  `).get(normMac);

  if (!session) return { found: false };

  // Calculate remaining duration in minutes for Omada
  const remaining = Math.max(
    1,
    Math.round((new Date(session.end_at) - Date.now()) / 60000)
  );

  // Re-authorize with Omada on the NEW AP — do NOT update session.ap_mac
  const omadaResult = await omada.authorizeClient({
    clientMac: normMac,
    apMac:     newApMac,
    ssidName,
    radioId,
    site,
    durationMinutes: remaining,
  });

  // Log the roam event (non-destructive — separate table)
  try {
    db.prepare(`
      INSERT INTO session_roam_log (session_id, from_ap_mac, to_ap_mac, roamed_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(session.id, session.ap_mac, newApMac);
  } catch {
    // Table may not exist yet — non-fatal, just skip logging
  }

  return {
    found:            true,
    success:          omadaResult.success,
    sessionId:        session.id,
    remainingMinutes: remaining,
    omada:            omadaResult,
  };
}

module.exports = { authorizeSession, deauthorizeSession, reauthorizeRoamingSession };