const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard — main overview stats
router.get('/', requireAuth, (req, res) => {
  const { site_id } = req.query;
  const siteFilter = site_id ? 'AND site_id = ?' : '';
  const siteParam = site_id ? [site_id] : [];

  const overview = {
    // Revenue
    revenue_today: db.prepare(`
      SELECT COALESCE(SUM(amount_paid), 0) as total FROM sessions
      WHERE date(start_at) = date('now') ${siteFilter}
    `).get(...siteParam).total,

    revenue_month: db.prepare(`
      SELECT COALESCE(SUM(amount_paid), 0) as total FROM sessions
      WHERE start_at >= date('now', 'start of month') ${siteFilter}
    `).get(...siteParam).total,

    revenue_alltime: db.prepare(`
      SELECT COALESCE(SUM(amount_paid), 0) as total FROM sessions WHERE 1=1 ${siteFilter}
    `).get(...siteParam).total,

    // Sessions
    active_sessions: db.prepare(`
      SELECT COUNT(*) as n FROM sessions
      WHERE status = 'active' AND end_at > datetime('now') ${siteFilter}
    `).get(...siteParam).n,

    sessions_today: db.prepare(`
      SELECT COUNT(*) as n FROM sessions
      WHERE date(start_at) = date('now') ${siteFilter}
    `).get(...siteParam).n,

    // Users
    total_users: db.prepare('SELECT COUNT(*) as n FROM users').get().n,

    new_users_month: db.prepare(`
      SELECT COUNT(*) as n FROM users
      WHERE created_at >= date('now', 'start of month')
    `).get().n,

    // Revenue last 30 days (daily breakdown for chart)
    daily_revenue: db.prepare(`
      SELECT date(start_at) as date,
             COALESCE(SUM(amount_paid), 0) as revenue,
             COUNT(*) as sessions
      FROM sessions
      WHERE start_at >= date('now', '-29 days') ${siteFilter}
      GROUP BY date(start_at)
      ORDER BY date ASC
    `).all(...siteParam),

    // Package breakdown
    package_breakdown: db.prepare(`
      SELECT p.name, COUNT(s.id) as sessions,
             COALESCE(SUM(s.amount_paid), 0) as revenue
      FROM sessions s JOIN packages p ON s.package_id = p.id
      WHERE 1=1 ${siteFilter.replace('site_id', 's.site_id')}
      GROUP BY p.id ORDER BY revenue DESC
    `).all(...siteParam),

    // Top 5 users this month
    top_users: db.prepare(`
      SELECT u.phone, u.tier, u.loyalty_points,
             COALESCE(SUM(s.amount_paid), 0) as month_spend,
             COUNT(s.id) as month_sessions
      FROM sessions s JOIN users u ON s.user_id = u.id
      WHERE s.start_at >= date('now', 'start of month') ${siteFilter.replace('site_id', 's.site_id')}
      GROUP BY u.id ORDER BY month_spend DESC LIMIT 5
    `).all(...siteParam),

    // Recent transactions
    recent_sessions: db.prepare(`
      SELECT s.id, s.amount_paid, s.payment_method, s.start_at, s.end_at, s.status,
             u.phone, p.name as package_name
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      JOIN packages p ON s.package_id = p.id
      WHERE 1=1 ${siteFilter.replace('site_id', 's.site_id')}
      ORDER BY s.start_at DESC LIMIT 10
    `).all(...siteParam),

    // Sites overview
    sites: db.prepare(`
      SELECT s.id, s.name, s.is_active,
        (SELECT COUNT(*) FROM access_points WHERE site_id = s.id) as ap_count,
        (SELECT COUNT(*) FROM access_points WHERE site_id = s.id AND status = 'online') as ap_online,
        (SELECT COALESCE(SUM(amount_paid),0) FROM sessions WHERE site_id = s.id AND start_at >= date('now','start of month')) as month_revenue
      FROM sites s ORDER BY s.name
    `).all(),
  };

  res.json(overview);
});

module.exports = router;
