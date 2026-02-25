const express = require('express');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/sms/providers
router.get('/providers', requireAuth, (req, res) => {
  const providers = db.prepare('SELECT * FROM sms_providers ORDER BY name').all();
  // Mask tokens — only return last 6 chars
  const masked = providers.map(p => ({
    ...p,
    api_token: p.api_token ? '••••••••' + p.api_token.slice(-6) : null,
    _has_token: !!p.api_token,
  }));
  res.json({ providers: masked });
});

// ── PUT /api/sms/providers/:id — update provider credentials
router.put('/providers/:id', requireAuth, (req, res) => {
  const { api_token, sender_id, is_active, is_default } = req.body;
  const provider = db.prepare('SELECT * FROM sms_providers WHERE id = ?').get(req.params.id);
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  // Only update token if a new one is provided (not the masked value)
  const newToken = api_token && !api_token.startsWith('••••')
    ? api_token.trim()
    : provider.api_token;

  // If setting as default, unset all others
  if (is_default) {
    db.prepare('UPDATE sms_providers SET is_default = 0').run();
  }

  db.prepare(`
    UPDATE sms_providers SET
      api_token  = ?,
      sender_id  = ?,
      is_active  = ?,
      is_default = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(newToken, sender_id || provider.sender_id, is_active ? 1 : 0, is_default ? 1 : 0, req.params.id);

  res.json({ success: true });
});

// ── GET /api/sms/templates
router.get('/templates', requireAuth, (req, res) => {
  const templates = db.prepare('SELECT * FROM sms_templates ORDER BY name').all();
  res.json({ templates });
});

// ── PUT /api/sms/templates/:id — update template content or toggle
router.put('/templates/:id', requireAuth, (req, res) => {
  const { content, is_active, label } = req.body;
  const tmpl = db.prepare('SELECT * FROM sms_templates WHERE id = ?').get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: 'Template not found' });

  db.prepare(`
    UPDATE sms_templates SET
      content    = ?,
      label      = ?,
      is_active  = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    content  !== undefined ? content  : tmpl.content,
    label    !== undefined ? label    : tmpl.label,
    is_active !== undefined ? (is_active ? 1 : 0) : tmpl.is_active,
    req.params.id
  );

  res.json({ success: true });
});

// ── POST /api/sms/test — send a test SMS
router.post('/test', requireAuth, async (req, res) => {
  const { phone, provider_id } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });

  const sms = require('../services/sms');
  const result = await sms.sendAndLog({
    phone,
    messageType: 'custom',
    message: 'This is a test message from Monarch Wireless SMS system.',
  });

  res.json(result);
});

// ── GET /api/sms/log
router.get('/log', requireAuth, (req, res) => {
  const logs = db.prepare(`
    SELECT s.*, u.phone as user_phone
    FROM sms_log s
    LEFT JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC
    LIMIT 100
  `).all();
  res.json({ logs });
});

// ── POST /api/sms/broadcast
router.post('/broadcast', requireAuth, async (req, res) => {
  const { message, tier } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  let query = "SELECT id, phone FROM users WHERE opted_in_sms=1 AND is_active=1 AND phone NOT LIKE 'mac:%'";
  const params = [];
  if (tier) { query += ' AND tier = ?'; params.push(tier); }
  const users = db.prepare(query).all(...params);

  if (!users.length) return res.json({ sent: 0 });

  const sms = require('../services/sms');
  let sent = 0;
  for (const user of users) {
    try {
      await sms.customMessage({ userId: user.id, phone: user.phone, message });
      sent++;
      await new Promise(r => setTimeout(r, 200));
    } catch(e) { /* continue */ }
  }
  res.json({ sent, total: users.length });
});

module.exports = router;
