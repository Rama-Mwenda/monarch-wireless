const express = require('express');
const path    = require('path');
const db      = require('../db');
const sms     = require('../services/sms');
const macAuth   = require('../helpers/mac-auth-helper');
const punchcard = require('../helpers/punchcard');

const router = express.Router();

// ── GET /portal — serve the captive portal HTML
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/portal.html'));
});

// ── GET /portal/packages — PUBLIC, no auth needed
// Accepts optional ?ap_mac=XX:XX:XX query param to apply per-AP price overrides
router.get('/packages', (req, res) => {
  const { ap_mac } = req.query;

  const packages = db.prepare(`
    SELECT
      p.id, p.name, p.price, p.duration_minutes, p.data_cap_mb, p.is_active, p.is_promo,
      COALESCE(SUM(s.amount_paid), 0) as total_revenue
    FROM packages p
    LEFT JOIN sessions s ON s.package_id = p.id
      AND s.start_at >= datetime('now', '-30 days')
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY p.price ASC
  `).all();

  // Apply per-AP price overrides if ap_mac provided
  let overrideMap = {};
  if (ap_mac) {
    const overrides = db.prepare(
      'SELECT package_id, price FROM ap_package_overrides WHERE ap_mac = ?'
    ).all(ap_mac);
    overrideMap = Object.fromEntries(overrides.map(o => [o.package_id, o.price]));
  }

  // Calculate revenue share and mark most popular
  const totalRevenue = packages.reduce((sum, p) => sum + p.total_revenue, 0);
  const withShare = packages.map(p => ({
    ...p,
    price: overrideMap[p.id] ?? p.price,   // apply override if exists
    revenue_share: totalRevenue > 0 ? (p.total_revenue / totalRevenue) : 0,
  }));

  // Most popular = highest revenue share, only badge if >25% share
  const maxRevenue = Math.max(...withShare.map(p => p.total_revenue));
  const result = withShare.map(p => ({
    ...p,
    is_popular: maxRevenue > 0 && p.total_revenue === maxRevenue && p.revenue_share >= 0.25,
  }));

  res.json(result);
});

// ── GET /portal/vouchers/lookup?code=MW-XXXX-XXXX — PUBLIC
router.get('/vouchers/lookup', (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const voucher = db.prepare(`
    SELECT v.*, p.name as package_name, p.duration_minutes, p.price
    FROM vouchers v
    JOIN packages p ON v.package_id = p.id
    WHERE v.code = ?
  `).get(code.toUpperCase().trim());

  if (!voucher)        return res.status(404).json({ error: 'Voucher not found' });
  if (voucher.is_used) return res.status(400).json({ error: 'Voucher has already been used' });
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Voucher has expired' });
  }

  res.json({ voucher });
});

// ── POST /portal/vouchers/redeem — PUBLIC
router.post('/vouchers/redeem', (req, res) => {
  const { code, mac } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const voucher = db.prepare(`
    SELECT v.*, p.name as package_name, p.duration_minutes, p.price
    FROM vouchers v
    JOIN packages p ON v.package_id = p.id
    WHERE v.code = ?
  `).get(code.toUpperCase().trim());

  if (!voucher)        return res.status(404).json({ error: 'Voucher not found' });
  if (voucher.is_used) return res.status(400).json({ error: 'Voucher already used' });
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Voucher expired' });
  }

  // Get or create user by MAC
  const phoneKey = `mac:${mac || Date.now()}`;
  let user = mac ? db.prepare('SELECT * FROM users WHERE mac_address = ?').get(mac) : null;
  if (!user) {
    db.prepare('INSERT OR IGNORE INTO users (phone, mac_address) VALUES (?, ?)').run(phoneKey, mac || null);
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phoneKey);
  }

  const endAt = new Date(Date.now() + voucher.duration_minutes * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions
      (user_id, site_id, package_id, voucher_id, mac_address, payment_method, amount_paid, end_at)
    VALUES (?, (SELECT id FROM sites LIMIT 1), ?, ?, ?, 'voucher', 0, ?)
  `).run(user.id, voucher.package_id, voucher.id, mac || null, endAt);

  db.prepare(`UPDATE vouchers SET is_used=1, used_by=?, used_at=datetime('now') WHERE id=?`)
    .run(user.id, voucher.id);

  db.prepare(`UPDATE users SET total_sessions=total_sessions+1, last_seen=datetime('now') WHERE id=?`)
    .run(user.id);

  // Punchcard check (non-blocking)
  if (user.phone && !user.phone.startsWith('mac:')) {
    punchcard.checkPunchcard(user.id, user.phone).catch(console.error);
  }

  // Authorize MAC with Omada (non-blocking)
  if (mac) {
    const sessionRow = db.prepare('SELECT id FROM sessions WHERE user_id=? ORDER BY start_at DESC LIMIT 1').get(user.id);
    if (sessionRow) {
      macAuth.authorizeSession({
        sessionId:       sessionRow.id,
        userId:          user.id,
        packageId:       voucher.package_id,
        clientMac:       mac,
        apMac:           req.body.apMac    || null,
        ssidName:        req.body.ssidName || null,
        radioId:         req.body.radioId  || null,
        site:            process.env.OMADA_SITE_NAME,
        durationMinutes: voucher.duration_minutes,
      }).catch(e => console.error('MAC auth error:', e.message));
    }
  }

  // Send SMS confirmation (non-blocking, only if real phone)
  if (user.phone && !user.phone.startsWith('mac:')) {
    sms.voucherRedeemed({
      userId:      user.id,
      phone:       user.phone,
      packageName: voucher.package_name,
      duration:    sms.fmtDuration(voucher.duration_minutes),
      expiresAt:   endAt,
    }).catch(console.error);
  }

  res.json({
    message:          'Voucher redeemed successfully',
    package_name:     voucher.package_name,
    duration_minutes: voucher.duration_minutes,
    end_at:           endAt,
  });
});

module.exports = router;