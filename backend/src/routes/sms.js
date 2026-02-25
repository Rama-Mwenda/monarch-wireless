const express = require('express');
const db      = require('../db');
const sms     = require('../services/sms');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/sms/log — view SMS history
router.get('/log', requireAuth, (req, res) => {
  const logs = db.prepare(`
    SELECT s.*, u.phone as user_phone
    FROM sms_log s
    LEFT JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC
    LIMIT 200
  `).all();
  res.json({ logs });
});

// ── POST /api/sms/broadcast — send to all opted-in users
router.post('/broadcast', requireAuth, async (req, res) => {
  const { message, tier } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  let query = 'SELECT id, phone FROM users WHERE opted_in_sms = 1 AND is_active = 1 AND phone NOT LIKE "mac:%"';
  const params = [];
  if (tier) { query += ' AND tier = ?'; params.push(tier); }

  const users = db.prepare(query).all(...params);
  if (!users.length) return res.json({ sent: 0, message: 'No eligible users' });

  // Send in batches of 10 to avoid rate limits
  let sent = 0;
  for (const user of users) {
    try {
      await sms.customMessage({ userId: user.id, phone: user.phone, message });
      sent++;
      await new Promise(r => setTimeout(r, 200)); // 200ms between sends
    } catch (e) {
      console.error(`Broadcast failed for ${user.phone}:`, e.message);
    }
  }

  res.json({ sent, total: users.length, message: `Sent to ${sent}/${users.length} users` });
});

// ── POST /api/sms/send — send to a single user
router.post('/send', requireAuth, async (req, res) => {
  const { phone, message, user_id } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });

  const result = await sms.customMessage({ userId: user_id, phone, message });
  res.json(result);
});

// ── GET /api/sms/stats — SMS usage stats
router.get('/stats', requireAuth, (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN message_type = 'session_started' THEN 1 ELSE 0 END) as session_confirmations,
      SUM(CASE WHEN message_type = 'custom' THEN 1 ELSE 0 END) as broadcasts
    FROM sms_log
    WHERE created_at >= date('now', '-30 days')
  `).get();
  res.json(stats);
});

module.exports = router;
