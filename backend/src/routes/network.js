const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const omada = require('../services/omada');

const router = express.Router();

// GET /api/network/aps
router.get('/aps', requireAuth, async (req, res) => {
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

    res.json({
      aps: liveAps,
      summary: {
        total: liveAps.length,
        online: liveAps.filter(a => a.status === 'online').length,
        offline: liveAps.filter(a => a.status === 'offline').length,
        total_clients: liveAps.reduce((s, a) => s + (a.connected_clients || 0), 0),
      }
    });
  } catch (err) {
    console.error('Network APs error:', err.message);
    res.status(502).json({
      error: 'Could not reach Omada controller',
      detail: err.message,
      aps: db.prepare('SELECT * FROM access_points ORDER BY name').all(),
      from_cache: true,
    });
  }
});

// GET /api/network/clients — live connected clients from Omada
router.get('/clients', requireAuth, async (req, res) => {
  try {
    const clients = await omada.getClients();

    // Auto-save clients to users table (upsert by MAC address)
    const upsertUser = db.prepare(`
      INSERT INTO users (phone, name, mac_address, last_seen)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET
        name = COALESCE(excluded.name, users.name),
        mac_address = COALESCE(excluded.mac_address, users.mac_address),
        last_seen = excluded.last_seen
    `);

    for (const c of clients) {
      if (c.mac) {
        // Use MAC as phone placeholder for wifi-only clients (no phone number yet)
        const phoneKey = c.phone || `mac:${c.mac}`;
        try {
          upsertUser.run(phoneKey, c.name || null, c.mac, );
        } catch (e) {}
      }
    }

    res.json({ clients, total: clients.length });
  } catch (err) {
    console.error('Network clients error:', err.message);
    res.status(502).json({ error: 'Could not fetch clients', detail: err.message, clients: [] });
  }
});

// GET /api/network/stats
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await omada.getSiteStats();
    res.json(stats);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach Omada controller', detail: err.message });
  }
});

module.exports = router;