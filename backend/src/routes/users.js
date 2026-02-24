const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const router = express.Router();

// GET /api/users — list users with filters
router.get('/', requireAuth, (req, res) => {
  const { search, tier, inactive_days, limit = 100, offset = 0 } = req.query;

  let query = `
    SELECT u.*,
      (SELECT COUNT(*) FROM sessions WHERE user_id = u.id AND status = 'active') as active_sessions
    FROM users u WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ' AND (u.phone LIKE ? OR u.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (tier) { query += ' AND u.tier = ?'; params.push(tier); }
  if (inactive_days) {
    query += ` AND (u.last_seen IS NULL OR u.last_seen < datetime('now', ?))`;
    params.push(`-${inactive_days} days`);
  }

  query += ' ORDER BY u.total_spent DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const users = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

  res.json({ users, total });
});

// GET /api/users/:id — single user with session history
router.get('/:id', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const sessions = db.prepare(`
    SELECT s.*, p.name as package_name, p.price
    FROM sessions s JOIN packages p ON s.package_id = p.id
    WHERE s.user_id = ?
    ORDER BY s.start_at DESC LIMIT 50
  `).all(req.params.id);

  res.json({ ...user, sessions });
});

// PATCH /api/users/:id — update user (admin)
router.patch('/:id',
  requireAuth,
  requireRole('super_admin', 'site_manager'),
  auditLog('update_user', (req) => req.params.id),
  (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, tier, loyalty_points, opted_in_sms, is_active } = req.body;
    const updates = [];
    const values = [];

    if (name !== undefined)          { updates.push('name = ?');           values.push(name); }
    if (tier !== undefined)          { updates.push('tier = ?');           values.push(tier); }
    if (loyalty_points !== undefined){ updates.push('loyalty_points = ?'); values.push(loyalty_points); }
    if (opted_in_sms !== undefined)  { updates.push('opted_in_sms = ?');  values.push(opted_in_sms ? 1 : 0); }
    if (is_active !== undefined)     { updates.push('is_active = ?');      values.push(is_active ? 1 : 0); }

    if (updates.length === 0) return res.status(400).json({ error: 'No valid fields' });

    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json(db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id));
  }
);

// POST /api/users/:id/extend-session — admin extends active session
router.post('/:id/extend-session',
  requireAuth,
  requireRole('super_admin', 'site_manager'),
  auditLog('extend_session', (req) => req.params.id),
  (req, res) => {
    const { minutes } = req.body;
    if (!minutes || minutes < 1) {
      return res.status(400).json({ error: 'Minutes required (min 1)' });
    }

    const session = db.prepare(`
      SELECT * FROM sessions WHERE user_id = ? AND status = 'active'
      ORDER BY start_at DESC LIMIT 1
    `).get(req.params.id);

    if (!session) return res.status(404).json({ error: 'No active session found' });

    const newEnd = new Date(new Date(session.end_at).getTime() + minutes * 60 * 1000).toISOString();
    db.prepare('UPDATE sessions SET end_at = ? WHERE id = ?').run(newEnd, session.id);

    res.json({ message: `Session extended by ${minutes} minutes`, new_end_at: newEnd });
  }
);

// POST /api/users/:id/add-points — admin manually adds loyalty points
router.post('/:id/add-points',
  requireAuth,
  requireRole('super_admin'),
  auditLog('add_points', (req) => req.params.id),
  (req, res) => {
    const { points, reason } = req.body;
    if (!points || points < 1) return res.status(400).json({ error: 'Points required (min 1)' });

    db.prepare('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?')
      .run(points, req.params.id);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    res.json({ message: `Added ${points} points`, user });
  }
);

// GET /api/users/stats/summary — dashboard summary stats
router.get('/stats/summary', requireAuth, (req, res) => {
  const stats = {
    total_users: db.prepare('SELECT COUNT(*) as n FROM users').get().n,
    active_today: db.prepare(`
      SELECT COUNT(DISTINCT user_id) as n FROM sessions
      WHERE start_at >= date('now') AND status = 'active'
    `).get().n,
    inactive_14d: db.prepare(`
      SELECT COUNT(*) as n FROM users
      WHERE last_seen < datetime('now', '-14 days') OR last_seen IS NULL
    `).get().n,
    tier_breakdown: db.prepare(`
      SELECT tier, COUNT(*) as count FROM users GROUP BY tier
    `).all(),
    revenue_today: db.prepare(`
      SELECT COALESCE(SUM(amount_paid), 0) as total FROM sessions
      WHERE start_at >= date('now')
    `).get().total,
    revenue_month: db.prepare(`
      SELECT COALESCE(SUM(amount_paid), 0) as total FROM sessions
      WHERE start_at >= date('now', 'start of month')
    `).get().total,
  };

  res.json(stats);
});

module.exports = router;
