const express = require('express');
const path    = require('path');
const db      = require('../db');

const router = express.Router();

// ── GET /portal — serve the captive portal HTML
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/portal.html'));
});

// ── GET /portal/packages — PUBLIC, no auth needed
router.get('/packages', (req, res) => {
  const packages = db.prepare(`
    SELECT id, name, price, duration_minutes, data_cap_mb, is_active
    FROM packages
    WHERE is_active = 1
    ORDER BY price ASC
  `).all();
  res.json(packages);
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

  res.json({
    message:          'Voucher redeemed successfully',
    package_name:     voucher.package_name,
    duration_minutes: voucher.duration_minutes,
    end_at:           endAt,
  });
});

module.exports = router;
