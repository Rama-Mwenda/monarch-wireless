const express = require('express');
const db      = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const requireSuperAdmin = requireRole('super_admin');

const router = express.Router();

// ── GET /api/payment/providers ────────────────────────────────
router.get('/providers', requireAuth, (req, res) => {
  const providers = db.prepare(
    'SELECT * FROM payment_providers ORDER BY name'
  ).all();

  // Parse config JSON and mask secrets
  const result = providers.map(p => {
    let cfg = {};
    try { cfg = p.config ? JSON.parse(p.config) : {}; } catch {}

    // Mask secret fields
    const masked = { ...cfg };
    ['clientSecret', 'apiKey', 'passkey', 'consumerSecret'].forEach(k => {
      if (masked[k]) masked[k] = '••••••••' + masked[k].slice(-6);
    });

    return {
      id:          p.id,
      name:        p.name,
      label:       p.label,
      description: p.description,
      is_active:   p.is_active,
      is_default:  p.is_default,
      updated_at:  p.updated_at,
      config:      masked,
      _configured: Object.keys(cfg).length > 0,
    };
  });

  res.json({ providers: result });
});

// ── PUT /api/payment/providers/:id ───────────────────────────
router.put('/providers/:id', requireAuth, requireSuperAdmin, (req, res) => {
  const { is_active, is_default, config } = req.body;

  const provider = db.prepare(
    'SELECT * FROM payment_providers WHERE id = ?'
  ).get(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  // Merge new config with existing — don't overwrite masked values
  let existingCfg = {};
  try { existingCfg = provider.config ? JSON.parse(provider.config) : {}; } catch {}

  const mergedCfg = { ...existingCfg };
  if (config && typeof config === 'object') {
    for (const [k, v] of Object.entries(config)) {
      // Skip masked values
      if (typeof v === 'string' && v.startsWith('••••')) continue;
      if (v !== undefined && v !== '') mergedCfg[k] = v;
    }
  }

  // If setting as default, unset all others first
  if (is_default) {
    db.prepare('UPDATE payment_providers SET is_default = 0').run();
  }

  db.prepare(`
    UPDATE payment_providers SET
      is_active  = ?,
      is_default = ?,
      config     = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    is_active  !== undefined ? (is_active  ? 1 : 0) : provider.is_active,
    is_default !== undefined ? (is_default ? 1 : 0) : provider.is_default,
    JSON.stringify(mergedCfg),
    req.params.id
  );

  // Clear K2 token cache if kopokopo config changed
  if (provider.name === 'kopokopo') {
    try { require('../services/kopokopo').clearTokenCache(); } catch {}
  }
  if (provider.name === 'mpesa') {
    try { require('../services/mpesa').clearTokenCache(); } catch {}
  }

  res.json({ success: true });
});

// ── GET /api/payment/active-provider ─────────────────────────
// Used by portal and mpesa route to know which gateway to use
router.get('/active-provider', (req, res) => {
  const provider = db.prepare(
    "SELECT name FROM payment_providers WHERE is_default = 1 LIMIT 1"
  ).get();
  res.json({ provider: provider?.name || 'mpesa' });
});


// ── POST /api/payment/test-connection — test M-Pesa ──────────
router.post('/test-connection', requireAuth, async (req, res) => {
  try {
    const mpesa = require('../services/mpesa');
    const token = await mpesa.getToken();
    if (!token) return res.status(400).json({ error: 'Failed to obtain M-Pesa token — check credentials' });
    res.json({ message: 'M-Pesa connection successful ✅ Token obtained' });
  } catch(e) {
    res.status(400).json({ error: e.response?.data?.errorMessage || e.message });
  }
});

// ── POST /api/payment/test-k2-connection — test KopoKopo ─────
router.post('/test-k2-connection', requireAuth, async (req, res) => {
  try {
    const k2 = require('../services/kopokopo');
    const token = await k2.getToken();
    if (!token) return res.status(400).json({ error: 'Failed to obtain K2 token — check credentials' });
    res.json({ message: 'KopoKopo connection successful ✅ Token obtained' });
  } catch(e) {
    res.status(400).json({ error: e.response?.data?.error_description || e.message });
  }
});

module.exports = router;