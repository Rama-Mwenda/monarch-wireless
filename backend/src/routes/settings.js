/**
 * settings.js
 * App-level settings stored in payment_config table.
 * GET  /api/settings        — fetch all settings
 * PUT  /api/settings        — update one or more settings
 */

const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Ensure settings keys exist in payment_config ─────────────
// Called on first load to seed defaults if not present
function ensureDefaults() {
  const defaults = [
    { key: 'punch_target', value: '6', label: 'Punch Card Target', description: 'Number of sessions required to earn a free session' },
  ];
  for (const d of defaults) {
    try {
      const exists = db.prepare('SELECT id FROM payment_config WHERE key = ?').get(d.key);
      if (!exists) {
        db.prepare(`
          INSERT INTO payment_config (key, value, label, description, is_secret)
          VALUES (?, ?, ?, ?, 0)
        `).run(d.key, d.value, d.label, d.description);
      }
    } catch(e) { /* ignore */ }
  }
}

try { ensureDefaults(); } catch(e) { /* ignore on boot */ }

// ── GET /api/settings ─────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  try {
    const punch = db.prepare("SELECT value FROM payment_config WHERE key = 'punch_target'").get();
    res.json({
      punch_target: parseInt(punch?.value || '10'),
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/settings ─────────────────────────────────────────
router.put('/', requireAuth, (req, res) => {
  const { punch_target } = req.body;

  try {
    if (punch_target !== undefined) {
      const val = parseInt(punch_target);
      if (isNaN(val) || val < 1 || val > 100) {
        return res.status(400).json({ error: 'punch_target must be a number between 1 and 100' });
      }
      db.prepare(`
        INSERT INTO payment_config (key, value, label, description, is_secret)
        VALUES ('punch_target', ?, 'Punch Card Target', 'Sessions required to earn a free session', 0)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
      `).run(String(val));
    }

    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;