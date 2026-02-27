const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const router = express.Router();

// Generate a clean, readable voucher code e.g. MW-X7K2-P9QR
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `MW-${rand(4)}-${rand(4)}`;
}

// GET /api/vouchers — list vouchers
router.get('/', requireAuth, (req, res) => {
  const { site_id, package_id, status } = req.query;

  let query = `
    SELECT v.*, p.name as package_name, p.price, p.duration_minutes,
           u.phone as used_by_phone,
           CASE
             WHEN v.is_used = 1 THEN 'used'
             WHEN v.expires_at IS NOT NULL AND v.expires_at < datetime('now') THEN 'expired'
             ELSE 'available'
           END as computed_status
    FROM vouchers v
    JOIN packages p ON v.package_id = p.id
    LEFT JOIN users u ON v.used_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (site_id)    { query += ' AND v.site_id = ?';    params.push(site_id); }
  if (package_id) { query += ' AND v.package_id = ?'; params.push(package_id); }
  if (status === 'used')      { query += ' AND v.is_used = 1'; }
  if (status === 'available') { query += " AND v.is_used = 0 AND (v.expires_at IS NULL OR v.expires_at >= datetime('now'))"; }
  if (status === 'expired')   { query += " AND v.is_used = 0 AND v.expires_at IS NOT NULL AND v.expires_at < datetime('now')"; }

  query += ' ORDER BY v.created_at DESC LIMIT 500';

  res.json(db.prepare(query).all(...params));
});

// POST /api/vouchers/generate — batch generate vouchers
router.post('/generate',
  requireAuth,
  requireRole('super_admin', 'site_manager'),
  auditLog('generate_vouchers', (req) => `package:${req.body.package_id}`),
  (req, res) => {
    const { package_id, quantity = 1, expires_at } = req.body;

    if (!package_id) return res.status(400).json({ error: 'package_id is required' });
    if (quantity < 1 || quantity > 500) {
      return res.status(400).json({ error: 'Quantity must be between 1 and 500' });
    }

    const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND is_active = 1').get(package_id);
    if (!pkg) return res.status(404).json({ error: 'Package not found or inactive' });

    const insert = db.prepare(`
      INSERT INTO vouchers (code, package_id, site_id, expires_at)
      VALUES (?, ?, ?, ?)
    `);

    const vouchers = [];
    const insertMany = db.transaction(() => {
      for (let i = 0; i < quantity; i++) {
        let code;
        // Ensure unique code
        do { code = generateCode(); }
        while (db.prepare('SELECT id FROM vouchers WHERE code = ?').get(code));

        insert.run(code, package_id, pkg.site_id, expires_at || null);
        vouchers.push(code);
      }
    });

    insertMany();

    res.status(201).json({
      message: `${quantity} voucher(s) generated`,
      package: pkg.name,
      vouchers,
    });
  }
);

// POST /api/vouchers/redeem — redeem a voucher (called by captive portal)
router.post('/redeem', (req, res) => {
  const { code, phone, mac_address } = req.body;

  if (!code || !phone) {
    return res.status(400).json({ error: 'Voucher code and phone number are required' });
  }

  // Normalize code
  const normalizedCode = code.trim().toUpperCase();

  const voucher = db.prepare(`
    SELECT v.*, p.name as package_name, p.price, p.duration_minutes,
           p.loyalty_points, p.site_id
    FROM vouchers v
    JOIN packages p ON v.package_id = p.id
    WHERE v.code = ?
  `).get(normalizedCode);

  if (!voucher) return res.status(404).json({ error: 'Invalid voucher code' });
  if (voucher.is_used) return res.status(409).json({ error: 'Voucher has already been used' });
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Voucher has expired' });
  }

  // Get or create user
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    db.prepare('INSERT INTO users (phone, mac_address) VALUES (?, ?)').run(phone, mac_address || null);
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  } else if (mac_address) {
    db.prepare('UPDATE users SET mac_address = ?, last_seen = datetime("now") WHERE id = ?')
      .run(mac_address, user.id);
  }

  // Calculate session end time
  const endAt = new Date(Date.now() + voucher.duration_minutes * 60 * 1000).toISOString();

  // Run everything in a transaction
  const activate = db.transaction(() => {
    // Mark voucher used
    db.prepare(`
      UPDATE vouchers SET is_used = 1, used_by = ?, used_at = datetime('now') WHERE id = ?
    `).run(user.id, voucher.id);

    // Create session
    db.prepare(`
      INSERT INTO sessions (user_id, site_id, package_id, voucher_id, mac_address,
        payment_method, amount_paid, loyalty_points_earned, end_at)
      VALUES (?, ?, ?, ?, ?, 'voucher', ?, ?, ?)
    `).run(
      user.id, voucher.site_id, voucher.package_id, voucher.id,
      mac_address || null, voucher.price, voucher.loyalty_points, endAt
    );

    // Update user stats
    const newPoints = user.loyalty_points + voucher.loyalty_points;
    const newTier = calculateTier(user.total_spent + voucher.price);
    db.prepare(`
      UPDATE users SET
        loyalty_points = ?,
        total_spent = total_spent + ?,
        total_sessions = total_sessions + 1,
        tier = ?,
        last_seen = datetime('now')
      WHERE id = ?
    `).run(newPoints, voucher.price, newTier, user.id);
  });

  activate();

  // Fetch updated user
  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

  res.json({
    success: true,
    message: 'Voucher redeemed successfully',
    session: {
      package: voucher.package_name,
      duration_minutes: voucher.duration_minutes,
      end_at: endAt,
    },
    user: {
      phone: updatedUser.phone,
      tier: updatedUser.tier,
      loyalty_points: updatedUser.loyalty_points,
      punch_count: updatedUser.punch_count,
    },
  });
});


// DELETE /api/vouchers/:id — delete a voucher (unused only)
router.delete('/:id',
  requireAuth,
  requireRole('super_admin', 'site_manager'),
  (req, res) => {
    const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(req.params.id);
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
    if (voucher.is_used) return res.status(400).json({ error: 'Cannot delete a used voucher' });

    db.prepare('DELETE FROM vouchers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Voucher deleted' });
  }
);

// DELETE /api/vouchers/bulk — delete multiple vouchers
router.post('/bulk-delete',
  requireAuth,
  requireRole('super_admin', 'site_manager'),
  (req, res) => {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'No ids provided' });

    const deleteStmt = db.prepare('DELETE FROM vouchers WHERE id = ? AND is_used = 0');
    const deleteMany = db.transaction(() => {
      let deleted = 0;
      for (const id of ids) {
        const result = deleteStmt.run(id);
        deleted += result.changes;
      }
      return deleted;
    });

    const deleted = deleteMany();
    res.json({ deleted, message: `${deleted} voucher(s) deleted` });
  }
);

// GET /api/vouchers/:code/check — check voucher validity
router.get('/:code/check', (req, res) => {
  const voucher = db.prepare(`
    SELECT v.code, v.is_used, v.expires_at, p.name as package_name,
           p.price, p.duration_minutes
    FROM vouchers v JOIN packages p ON v.package_id = p.id
    WHERE v.code = ?
  `).get(req.params.code.toUpperCase());

  if (!voucher) return res.status(404).json({ error: 'Invalid voucher code' });
  if (voucher.is_used) return res.json({ valid: false, reason: 'Already used' });
  if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
    return res.json({ valid: false, reason: 'Expired' });
  }

  res.json({ valid: true, voucher });
});

function calculateTier(totalSpent) {
  if (totalSpent >= 5000) return 'platinum';
  if (totalSpent >= 2000) return 'gold';
  if (totalSpent >= 500)  return 'silver';
  return 'bronze';
}

module.exports = router;