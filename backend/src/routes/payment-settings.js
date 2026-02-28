const express    = require('express');
const mpesa      = require('../services/mpesa');
const db         = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const requireSuperAdmin = requireRole('super_admin');

const router = express.Router();

// ── GET /api/payment/config — get all keys (secrets masked) ──
router.get('/config', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM payment_config ORDER BY key').all();

  const masked = rows.map(r => ({
    id:          r.id,
    key:         r.key,
    label:       r.label,
    description: r.description,
    is_secret:   r.is_secret,
    updated_at:  r.updated_at,
    // Mask secrets — show only last 6 chars
    value: r.is_secret && r.value
      ? '••••••••' + r.value.slice(-6)
      : (r.value || ''),
    _has_value: !!r.value,
  }));

  res.json({ config: masked });
});

// ── PUT /api/payment/config — update one or many keys ────────
router.put('/config', requireAuth, requireSuperAdmin, (req, res) => {
  const { updates } = req.body; // [{ key, value }]
  if (!Array.isArray(updates) || !updates.length)
    return res.status(400).json({ error: 'updates array required' });

  const stmt = db.prepare(`
    UPDATE payment_config
    SET value = ?, updated_at = datetime('now')
    WHERE key = ?
  `);

  const updateMany = db.transaction((items) => {
    for (const { key, value } of items) {
      // Skip if value is masked (unchanged)
      if (typeof value === 'string' && value.startsWith('••••')) continue;
      stmt.run(value?.trim() || null, key);
    }
  });

  updateMany(updates);

  // Reload into process.env so mpesa service picks up new values immediately
  // without requiring a restart
  const all = db.prepare('SELECT key, value FROM payment_config').all();
  for (const { key, value } of all) {
    if (value) process.env[key.toUpperCase()] = value;
  }

  // Clear token cache so next request gets a fresh token with new credentials
  try { mpesa.clearTokenCache(); } catch {}

  res.json({ ok: true, message: 'Payment config updated' });
});

// ── POST /api/payment/test-connection — test M-Pesa token ────
router.post('/test-connection', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // Get live values from DB (not env, in case just updated)
    const rows = db.prepare('SELECT key, value FROM payment_config').all();
    const cfg  = Object.fromEntries(rows.map(r => [r.key, r.value]));

    if (!cfg.mpesa_consumer_key || !cfg.mpesa_consumer_secret) {
      return res.status(400).json({ error: 'Consumer Key and Secret are required' });
    }

    const base = cfg.mpesa_env === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

    const axios  = require('axios');
    const creds  = Buffer.from(`${cfg.mpesa_consumer_key}:${cfg.mpesa_consumer_secret}`).toString('base64');
    const result = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${creds}` },
      timeout: 8000,
    });

    if (result.data?.access_token) {
      res.json({ ok: true, message: `Connected to M-Pesa ${cfg.mpesa_env || 'sandbox'} ✅` });
    } else {
      res.status(400).json({ error: 'No access token returned — check credentials' });
    }
  } catch (err) {
    const msg = err.response?.data?.errorMessage || err.message || 'Connection failed';
    res.status(400).json({ error: `M-Pesa connection failed: ${msg}` });
  }
});

// ── GET /api/payment/expenses ─────────────────────────────────
router.get('/expenses', requireAuth, (req, res) => {
  const expenses = db.prepare('SELECT * FROM expenses ORDER BY category, label').all();
  res.json({ expenses });
});

// ── POST /api/payment/expenses — add new expense ──────────────
router.post('/expenses', requireAuth, requireSuperAdmin, (req, res) => {
  const { label, amount, category, is_monthly, amort_months } = req.body;
  if (!label) return res.status(400).json({ error: 'Label required' });

  const result = db.prepare(`
    INSERT INTO expenses (label, amount, category, is_monthly, amort_months)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    label.trim(),
    Number(amount) || 0,
    category || 'other',
    is_monthly ? 1 : 0,
    amort_months ? Number(amort_months) : null
  );

  const expense = db.prepare('SELECT * FROM expenses WHERE rowid = ?').get(result.lastInsertRowid);
  res.json({ expense });
});

// ── PUT /api/payment/expenses/:id — update expense ────────────
router.put('/expenses/:id', requireAuth, requireSuperAdmin, (req, res) => {
  const { label, amount, category, is_monthly, amort_months, is_active } = req.body;
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });

  db.prepare(`
    UPDATE expenses SET
      label        = ?,
      amount       = ?,
      category     = ?,
      is_monthly   = ?,
      amort_months = ?,
      is_active    = ?,
      updated_at   = datetime('now')
    WHERE id = ?
  `).run(
    label ?? expense.label,
    Number(amount) ?? expense.amount,
    category ?? expense.category,
    is_monthly !== undefined ? (is_monthly ? 1 : 0) : expense.is_monthly,
    amort_months !== undefined ? (amort_months ? Number(amort_months) : null) : expense.amort_months,
    is_active !== undefined ? (is_active ? 1 : 0) : expense.is_active,
    req.params.id
  );

  res.json({ ok: true });
});

// ── DELETE /api/payment/expenses/:id ─────────────────────────
router.delete('/expenses/:id', requireAuth, requireSuperAdmin, (req, res) => {
  // Prevent deleting seeded defaults
  const locked = ['isp-default', 'hw-default', 'vps-default'];
  if (locked.includes(req.params.id))
    return res.status(400).json({ error: 'Cannot delete default expenses. Set amount to 0 to disable.' });

  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;