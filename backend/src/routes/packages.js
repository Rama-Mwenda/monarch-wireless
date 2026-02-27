const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const router = express.Router();

// GET /api/packages — list all packages (optionally filter by site)
router.get('/', requireAuth, (req, res) => {
  const { site_id, active_only } = req.query;

  let query = 'SELECT p.*, s.name as site_name FROM packages p JOIN sites s ON p.site_id = s.id WHERE 1=1';
  const params = [];

  if (site_id) { query += ' AND p.site_id = ?'; params.push(site_id); }
  if (active_only === 'true') { query += ' AND p.is_active = 1'; }
  query += ' ORDER BY p.price ASC';

  const packages = db.prepare(query).all(...params);
  res.json(packages);
});

// GET /api/packages/:id
router.get('/:id', requireAuth, (req, res) => {
  const pkg = db.prepare(`
    SELECT p.*, s.name as site_name,
      (SELECT COUNT(*) FROM sessions WHERE package_id = p.id) as total_sessions,
      (SELECT COALESCE(SUM(amount_paid),0) FROM sessions WHERE package_id = p.id) as total_revenue
    FROM packages p JOIN sites s ON p.site_id = s.id
    WHERE p.id = ?
  `).get(req.params.id);

  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  res.json(pkg);
});

// POST /api/packages — create package
router.post('/',
  requireAuth,
  requireRole('super_admin', 'site_manager'),
  auditLog('create_package', (req, data) => data.id),
  (req, res) => {
    const {
      site_id, name, price, duration_minutes,
      data_cap_mb, download_kbps, upload_kbps,
      loyalty_points, is_promo, promo_start, promo_end
    } = req.body;

    if (!site_id || !name || !price || !duration_minutes) {
      return res.status(400).json({ error: 'site_id, name, price, duration_minutes are required' });
    }

    // Verify site exists
    const site = db.prepare('SELECT id FROM sites WHERE id = ?').get(site_id);
    if (!site) return res.status(400).json({ error: 'Site not found' });

    const result = db.prepare(`
      INSERT INTO packages (site_id, name, price, duration_minutes, data_cap_mb,
        download_kbps, upload_kbps, loyalty_points, is_promo, promo_start, promo_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      site_id, name, price, duration_minutes,
      data_cap_mb || null, download_kbps || null, upload_kbps || null,
      loyalty_points || 0, is_promo ? 1 : 0,
      promo_start || null, promo_end || null
    );

    const pkg = db.prepare('SELECT * FROM packages WHERE rowid = ?').get(result.lastInsertRowid);
    res.status(201).json(pkg);
  }
);

// PATCH /api/packages/:id — update package
router.patch('/:id',
  requireAuth,
  requireRole('super_admin', 'site_manager'),
  auditLog('update_package', (req) => req.params.id),
  (req, res) => {
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const fields = ['name','price','duration_minutes','data_cap_mb','download_kbps',
                    'upload_kbps','loyalty_points','is_active','is_promo','promo_start','promo_end','device_limit'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE packages SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
    res.json(updated);
  }
);

// DELETE /api/packages/:id — soft delete (deactivate)
router.delete('/:id',
  requireAuth,
  requireRole('super_admin'),
  auditLog('deactivate_package', (req) => req.params.id),
  (req, res) => {
    const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    db.prepare('UPDATE packages SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Package deactivated' });
  }
);

module.exports = router;