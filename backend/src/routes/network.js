const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const omada = require('../services/omada');

const router = express.Router();

// ── Helper: get the set of AP MACs this admin is allowed to see ──
// super_admin → all APs; site_manager → only their assigned APs
function getAllowedMacs(adminId, role) {
  if (role === 'super_admin') return null; // null = no filter, all APs
  return db.prepare(
    'SELECT ap_mac FROM ap_admins WHERE admin_id = ?'
  ).all(adminId).map(r => r.ap_mac);
}

// GET /api/network/aps
router.get('/aps', requireAuth, async (req, res) => {
  const { id: adminId, role } = req.admin;
  const allowedMacs = getAllowedMacs(adminId, role);

  try {
    const liveAps = await omada.getAccessPoints();

    const upsertAp = db.prepare(`
      INSERT INTO access_points (site_id, name, mac, model, omada_ap_id, status, connected_clients, last_seen)
      VALUES ((SELECT id FROM sites LIMIT 1), ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(mac) DO UPDATE SET
        name = excluded.name,
        status = excluded.status,
        connected_clients = excluded.connected_clients,
        last_seen = excluded.last_seen
    `);

    for (const ap of liveAps) {
      try { upsertAp.run(ap.name, ap.mac, ap.model, ap.id, ap.status, ap.connected_clients); }
      catch (e) {}
    }

    // Filter to assigned APs only for site_managers
    const filteredAps = allowedMacs
      ? liveAps.filter(ap => allowedMacs.includes(ap.mac))
      : liveAps;

    // Fallback cache also filtered
    res.json({
      aps: filteredAps,
      summary: {
        total:         filteredAps.length,
        online:        filteredAps.filter(a => a.status === 'online').length,
        offline:       filteredAps.filter(a => a.status === 'offline').length,
        total_clients: filteredAps.reduce((s, a) => s + (a.connected_clients || 0), 0),
      }
    });
  } catch (err) {
    console.error('Network APs error:', err.message);

    // Pull from DB cache, also filtered by role
    let cachedAps = db.prepare('SELECT * FROM access_points ORDER BY name').all();
    if (allowedMacs) {
      cachedAps = cachedAps.filter(ap => allowedMacs.includes(ap.mac));
    }

    res.status(502).json({
      error: 'Could not reach Omada controller',
      detail: err.message,
      aps: cachedAps,
      from_cache: true,
    });
  }
});

// GET /api/network/clients — live connected clients from Omada
router.get('/clients', requireAuth, async (req, res) => {
  const { id: adminId, role } = req.admin;
  const allowedMacs = getAllowedMacs(adminId, role);

  try {
    const allClients = await omada.getClients();

    // Auto-save ALL clients to users table regardless of role filter
    // (we want the full picture in the DB; we only restrict what's returned)
    const upsertUser = db.prepare(`
      INSERT INTO users (phone, name, mac_address, last_seen)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET
        name = COALESCE(excluded.name, users.name),
        mac_address = COALESCE(excluded.mac_address, users.mac_address),
        last_seen = excluded.last_seen
    `);

    for (const c of allClients) {
      if (c.mac) {
        const phoneKey = c.phone || `mac:${c.mac}`;
        try { upsertUser.run(phoneKey, c.name || null, c.mac); } catch (e) {}
      }
    }

    // Filter clients to only those on the admin's assigned APs
    const clients = allowedMacs
      ? allClients.filter(c => {
          const apMac = (c.ap_mac || '').toLowerCase().replace(/-/g, ':');
          return allowedMacs.some(m => m.toLowerCase().replace(/-/g, ':') === apMac);
        })
      : allClients;

    res.json({ clients, total: clients.length });
  } catch (err) {
    console.error('Network clients error:', err.message);
    res.status(502).json({ error: 'Could not fetch clients', detail: err.message, clients: [] });
  }
});

// GET /api/network/stats
router.get('/stats', requireAuth, async (req, res) => {
  const { id: adminId, role } = req.admin;
  const allowedMacs = getAllowedMacs(adminId, role);

  try {
    const stats = await omada.getSiteStats();

    // For site_managers, scope the stats to their APs only
    if (allowedMacs) {
      const aps = await omada.getAccessPoints();
      const myAps = aps.filter(ap => allowedMacs.includes(ap.mac));
      return res.json({
        total_aps:     myAps.length,
        online_aps:    myAps.filter(a => a.status === 'online').length,
        total_clients: myAps.reduce((s, a) => s + (a.connected_clients || 0), 0),
        site_name:     stats.site_name,
      });
    }

    res.json(stats);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Omada controller', detail: err.message });
  }
});

// POST /api/network/reconnect — force Omada cache clear + re-auth (super_admin only)
router.post('/reconnect', requireAuth, async (req, res) => {
  if (req.admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Only super admins can reconnect to Omada' });
  }
  try {
    omada.clearCache();
    const stats = await omada.getSiteStats();
    res.json({ message: 'Reconnected to Omada', stats });
  } catch(err) {
    res.status(502).json({ error: 'Reconnect failed', detail: err.message });
  }
});

module.exports = router;