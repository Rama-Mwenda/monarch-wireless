const express = require('express');
const db      = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const requireSuperAdmin = requireRole('super_admin');

const router = express.Router();

// ── Helper: get AP MACs assigned to an admin ─────────────────
function getAdminAPs(adminId) {
  return db.prepare(
    'SELECT ap_mac FROM ap_admins WHERE admin_id = ?'
  ).all(adminId).map(r => r.ap_mac);
}

// ── Helper: is this admin authorised for this AP? ────────────
function canAccessAP(adminId, role, apMac) {
  if (role === 'super_admin') return true;
  const assigned = getAdminAPs(adminId);
  return assigned.includes(apMac);
}

// ── GET /api/hosts/my-aps ─────────────────────────────────────
// Returns APs assigned to the current admin (site_manager)
router.get('/my-aps', requireAuth, (req, res) => {
  const { id: adminId, role } = req.admin;

  let aps;
  if (role === 'super_admin') {
    aps = db.prepare('SELECT * FROM access_points ORDER BY name').all();
  } else {
    const macs = getAdminAPs(adminId);
    if (!macs.length) return res.json({ aps: [] });
    const placeholders = macs.map(() => '?').join(',');
    aps = db.prepare(
      `SELECT * FROM access_points WHERE mac IN (${placeholders}) ORDER BY name`
    ).all(...macs);
  }

  res.json({ aps });
});

// ── GET /api/hosts/assignments ────────────────────────────────
// Super admin: get all admin→AP assignments
router.get('/assignments', requireAuth, requireSuperAdmin, (req, res) => {
  const assignments = db.prepare(`
    SELECT aa.*, a.username, a.email, a.role,
           ap.name as ap_name, ap.mac as ap_mac,
           ap.revenue_share_pct, ap.host_name, ap.host_phone
    FROM ap_admins aa
    JOIN admins a ON aa.admin_id = a.id
    JOIN access_points ap ON aa.ap_mac = ap.mac
    ORDER BY a.username, ap.name
  `).all();
  res.json({ assignments });
});

// ── POST /api/hosts/assignments ───────────────────────────────
// Super admin: assign admin to AP
router.post('/assignments', requireAuth, requireSuperAdmin, (req, res) => {
  const { admin_id, ap_mac } = req.body;
  if (!admin_id || !ap_mac)
    return res.status(400).json({ error: 'admin_id and ap_mac required' });

  // Verify admin exists and is site_manager
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(admin_id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  if (admin.role !== 'site_manager')
    return res.status(400).json({ error: 'Only site_manager accounts can be assigned to APs' });

  // Check if AP is already assigned to another admin
  const existing = db.prepare(
    'SELECT aa.admin_id, a.username FROM ap_admins aa JOIN admins a ON aa.admin_id = a.id WHERE aa.ap_mac = ?'
  ).get(ap_mac);

  if (existing && existing.admin_id !== admin_id) {
    return res.status(409).json({
      error: `This AP is already assigned to ${existing.username}. Remove that assignment first.`
    });
  }

  db.prepare(`
    INSERT OR IGNORE INTO ap_admins (admin_id, ap_mac) VALUES (?, ?)
  `).run(admin_id, ap_mac);

  res.json({ success: true });
});

// ── DELETE /api/hosts/assignments ─────────────────────────────
// Super admin: remove admin from AP
router.delete('/assignments', requireAuth, requireSuperAdmin, (req, res) => {
  const { admin_id, ap_mac } = req.body;
  db.prepare(
    'DELETE FROM ap_admins WHERE admin_id = ? AND ap_mac = ?'
  ).run(admin_id, ap_mac);
  res.json({ success: true });
});

// ── PUT /api/hosts/ap/:mac ────────────────────────────────────
// Super admin: update AP revenue share, host name, host phone
router.put('/ap/:mac', requireAuth, requireSuperAdmin, (req, res) => {
  const { mac } = req.params;
  const { revenue_share_pct, host_name, host_phone } = req.body;

  const ap = db.prepare('SELECT * FROM access_points WHERE mac = ?').get(mac);
  if (!ap) return res.status(404).json({ error: 'AP not found' });

  db.prepare(`
    UPDATE access_points SET
      revenue_share_pct = ?,
      host_name         = ?,
      host_phone        = ?
    WHERE mac = ?
  `).run(
    revenue_share_pct ?? ap.revenue_share_pct,
    host_name         ?? ap.host_name,
    host_phone        ?? ap.host_phone,
    mac
  );

  res.json({ success: true });
});

// ── GET /api/hosts/packages/:mac ─────────────────────────────
// Get packages with AP-specific price overrides
router.get('/packages/:mac', requireAuth, (req, res) => {
  const { mac } = req.params;
  const { id: adminId, role } = req.admin;

  if (!canAccessAP(adminId, role, mac))
    return res.status(403).json({ error: 'Not authorised for this AP' });

  const packages = db.prepare(
    'SELECT * FROM packages WHERE is_active = 1 ORDER BY price'
  ).all();

  const overrides = db.prepare(
    'SELECT * FROM ap_package_overrides WHERE ap_mac = ?'
  ).all(mac);

  const overrideMap = Object.fromEntries(overrides.map(o => [o.package_id, o.price]));

  const result = packages.map(p => ({
    ...p,
    system_price:    p.price,
    effective_price: overrideMap[p.id] ?? p.price,
    has_override:    overrideMap[p.id] !== undefined,
  }));

  res.json({ packages: result, ap_mac: mac });
});

// ── PUT /api/hosts/packages/:mac ─────────────────────────────
// Set price override for a package on a specific AP
router.put('/packages/:mac', requireAuth, (req, res) => {
  const { mac } = req.params;
  const { package_id, price } = req.body;
  const { id: adminId, role } = req.admin;

  if (!canAccessAP(adminId, role, mac))
    return res.status(403).json({ error: 'Not authorised for this AP' });

  if (!package_id || price === undefined)
    return res.status(400).json({ error: 'package_id and price required' });

  // Enforce minimum price >= system price
  if (price !== null) {
    const pkg = db.prepare('SELECT price FROM packages WHERE id = ?').get(package_id);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    if (price < pkg.price)
      return res.status(400).json({ error: `Price cannot be below system price of KES ${pkg.price}` });
  }

  if (price === null) {
    // Remove override — revert to system price
    db.prepare(
      'DELETE FROM ap_package_overrides WHERE ap_mac = ? AND package_id = ?'
    ).run(mac, package_id);
  } else {
    db.prepare(`
      INSERT INTO ap_package_overrides (ap_mac, package_id, price)
      VALUES (?, ?, ?)
      ON CONFLICT(ap_mac, package_id) DO UPDATE SET
        price      = excluded.price,
        updated_at = datetime('now')
    `).run(mac, package_id, price);
  }

  res.json({ success: true });
});

// ── GET /api/hosts/revenue/:mac ───────────────────────────────
// Revenue breakdown for a specific AP.
// Accepts optional ?month_start=YYYY-MM-DD&month_end=YYYY-MM-DD
// for historical month queries from the host reports page.
router.get('/revenue/:mac', requireAuth, (req, res) => {
  const { mac } = req.params;
  const { id: adminId, role } = req.admin;
  const { month_start, month_end } = req.query;

  if (!canAccessAP(adminId, role, mac))
    return res.status(403).json({ error: 'Not authorised for this AP' });

  const ap = db.prepare(
    'SELECT * FROM access_points WHERE mac = ?'
  ).get(mac);
  if (!ap) return res.status(404).json({ error: 'AP not found' });

  const sharePct = ap.revenue_share_pct ?? 70;

  // Use provided date range or fall back to current calendar month
  const periodStart = month_start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const periodEnd   = month_end   || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

  // Revenue for the selected period
  const monthRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount_paid), 0) as total
    FROM sessions
    WHERE ap_mac = ?
      AND date(start_at) BETWEEN ? AND ?
      AND payment_method != 'free'
  `).get(mac, periodStart, periodEnd)?.total || 0;

  // Revenue today (always current, not period-scoped)
  const todayRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount_paid), 0) as total
    FROM sessions
    WHERE ap_mac = ?
      AND date(start_at) = date('now')
      AND payment_method != 'free'
  `).get(mac)?.total || 0;

  // All time revenue (always full history)
  const allTimeRevenue = db.prepare(`
    SELECT COALESCE(SUM(amount_paid), 0) as total
    FROM sessions
    WHERE ap_mac = ?
      AND payment_method != 'free'
  `).get(mac)?.total || 0;

  // Monthly breakdown — last 6 months (always shown for trend chart)
  const monthly = db.prepare(`
    SELECT
      strftime('%Y-%m', start_at) as month,
      COALESCE(SUM(amount_paid), 0) as gross,
      COUNT(*) as sessions
    FROM sessions
    WHERE ap_mac = ?
      AND payment_method != 'free'
      AND start_at >= date('now', '-6 months')
    GROUP BY month
    ORDER BY month DESC
  `).all(mac);

  // Package breakdown for the selected period
  const byPackage = db.prepare(`
    SELECT p.name, COUNT(*) as sessions,
           COALESCE(SUM(s.amount_paid), 0) as revenue
    FROM sessions s
    JOIN packages p ON s.package_id = p.id
    WHERE s.ap_mac = ?
      AND date(s.start_at) BETWEEN ? AND ?
      AND s.payment_method != 'free'
    GROUP BY p.id
    ORDER BY revenue DESC
  `).all(mac, periodStart, periodEnd);

  // Recent transactions (always latest, not period-scoped)
  const recent = db.prepare(`
    SELECT s.*, p.name as package_name, u.phone
    FROM sessions s
    LEFT JOIN packages p ON s.package_id = p.id
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.ap_mac = ?
    ORDER BY s.start_at DESC
    LIMIT 20
  `).all(mac);

  res.json({
    ap,
    revenue_share_pct: sharePct,
    month_gross:        monthRevenue,
    month_host_share:   +(monthRevenue * sharePct / 100).toFixed(2),
    month_monarch_cut:  +(monthRevenue * (100 - sharePct) / 100).toFixed(2),
    today_gross:        todayRevenue,
    today_host_share:   +(todayRevenue * sharePct / 100).toFixed(2),
    alltime_gross:      allTimeRevenue,
    alltime_host_share: +(allTimeRevenue * sharePct / 100).toFixed(2),
    monthly_breakdown:  monthly.map(m => ({
      ...m,
      host_share: +(m.gross * sharePct / 100).toFixed(2),
    })),
    package_breakdown:  byPackage,
    recent_sessions:    recent,
    period_start:       periodStart,
    period_end:         periodEnd,
  });
});

// ── GET /api/hosts/ap-summary ─────────────────────────────────
// Super admin: per-AP revenue breakdown over a selected period.
// Accepts ?month_start=YYYY-MM-DD&month_end=YYYY-MM-DD
router.get('/ap-summary', requireAuth, requireSuperAdmin, (req, res) => {
  const { month_start, month_end } = req.query;

  const periodStart = month_start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const periodEnd   = month_end   || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

  const aps = db.prepare('SELECT * FROM access_points ORDER BY name').all();

  // Per-AP revenue for the period
  const apRevenue = db.prepare(`
    SELECT ap_mac,
           COALESCE(SUM(amount_paid), 0) as gross,
           COUNT(*) as sessions
    FROM sessions
    WHERE date(start_at) BETWEEN ? AND ?
      AND payment_method != 'free'
    GROUP BY ap_mac
  `).all(periodStart, periodEnd);

  const revenueMap = Object.fromEntries(apRevenue.map(r => [r.ap_mac, r]));

  const summary = aps.map(ap => {
    const rev      = revenueMap[ap.mac] || { gross: 0, sessions: 0 };
    const sharePct = ap.revenue_share_pct ?? 70;
    return {
      mac:          ap.mac,
      name:         ap.name || ap.mac,
      status:       ap.status,
      host_name:    ap.host_name,
      host_phone:   ap.host_phone,
      revenue_share_pct: sharePct,
      gross:        rev.gross,
      sessions:     rev.sessions,
      host_share:   +(rev.gross * sharePct / 100).toFixed(2),
      monarch_cut:  +(rev.gross * (100 - sharePct) / 100).toFixed(2),
    };
  });

  const totalGross   = summary.reduce((s, a) => s + a.gross, 0);
  const totalShare   = summary.reduce((s, a) => s + a.host_share, 0);
  const totalMonarch = summary.reduce((s, a) => s + a.monarch_cut, 0);

  res.json({
    period_start:   periodStart,
    period_end:     periodEnd,
    aps:            summary,
    total_gross:    totalGross,
    total_host_share:   +totalShare.toFixed(2),
    total_monarch_cut:  +totalMonarch.toFixed(2),
  });
});

// ── GET /api/hosts/dashboard ──────────────────────────────────
// Host admin dashboard — summary across all their APs
router.get('/dashboard', requireAuth, (req, res) => {
  const { id: adminId, role } = req.admin;

  let macs;
  if (role === 'super_admin') {
    macs = db.prepare('SELECT mac FROM access_points WHERE mac IS NOT NULL').all().map(r => r.mac);
  } else {
    macs = getAdminAPs(adminId);
  }

  if (!macs.length) {
    return res.json({
      aps: [], total_month_gross: 0, total_month_share: 0,
      total_today_gross: 0, total_today_share: 0,
    });
  }

  const placeholders = macs.map(() => '?').join(',');

  const aps = db.prepare(
    `SELECT * FROM access_points WHERE mac IN (${placeholders})`
  ).all(...macs);

  // Per-AP revenue this month
  const apRevenue = db.prepare(`
    SELECT ap_mac,
           COALESCE(SUM(amount_paid), 0) as month_gross,
           COUNT(*) as month_sessions
    FROM sessions
    WHERE ap_mac IN (${placeholders})
      AND strftime('%Y-%m', start_at) = strftime('%Y-%m', 'now')
      AND payment_method != 'free'
    GROUP BY ap_mac
  `).all(...macs);

  const todayRevenue = db.prepare(`
    SELECT ap_mac,
           COALESCE(SUM(amount_paid), 0) as today_gross
    FROM sessions
    WHERE ap_mac IN (${placeholders})
      AND date(start_at) = date('now')
      AND payment_method != 'free'
    GROUP BY ap_mac
  `).all(...macs);

  const revenueMap = Object.fromEntries(apRevenue.map(r => [r.ap_mac, r]));
  const todayMap   = Object.fromEntries(todayRevenue.map(r => [r.ap_mac, r.today_gross]));

  const apSummaries = aps.map(ap => {
    const rev      = revenueMap[ap.mac] || { month_gross: 0, month_sessions: 0 };
    const sharePct = ap.revenue_share_pct ?? 70;
    return {
      ...ap,
      month_gross:      rev.month_gross,
      month_sessions:   rev.month_sessions,
      month_host_share: +(rev.month_gross * sharePct / 100).toFixed(2),
      today_gross:      todayMap[ap.mac] || 0,
      today_host_share: +((todayMap[ap.mac] || 0) * sharePct / 100).toFixed(2),
    };
  });

  const totalMonthGross = apSummaries.reduce((s, a) => s + a.month_gross, 0);
  const totalMonthShare = apSummaries.reduce((s, a) => s + a.month_host_share, 0);
  const totalTodayGross = apSummaries.reduce((s, a) => s + a.today_gross, 0);
  const totalTodayShare = apSummaries.reduce((s, a) => s + a.today_host_share, 0);

  res.json({
    aps:                apSummaries,
    total_month_gross:  totalMonthGross,
    total_month_share:  +totalMonthShare.toFixed(2),
    total_today_gross:  totalTodayGross,
    total_today_share:  +totalTodayShare.toFixed(2),
  });
});

module.exports = router;