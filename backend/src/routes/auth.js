const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db        = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Brute force protection
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const admin = db.prepare(
    'SELECT * FROM admins WHERE username = ? OR email = ?'
  ).get(username, username);

  if (!admin || !bcrypt.compareSync(password, admin.password))
    return res.status(401).json({ error: 'Invalid credentials' });

  db.prepare("UPDATE admins SET last_login = datetime('now') WHERE id = ?").run(admin.id);

  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  // Detect if this is the default seeded password — force change
  const isDefaultPassword = bcrypt.compareSync('admin123', admin.password);

  res.json({
    token,
    mustChangePassword: isDefaultPassword,
    admin: {
      id:       admin.id,
      username: admin.username,
      email:    admin.email,
      role:     admin.role,
    },
  });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const admin = db.prepare(
    'SELECT id, username, email, role, created_at, last_login FROM admins WHERE id = ?'
  ).get(req.admin.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  res.json(admin);
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both current and new password required' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(currentPassword, admin.password))
    return res.status(401).json({ error: 'Current password is incorrect' });

  db.prepare('UPDATE admins SET password = ? WHERE id = ?')
    .run(bcrypt.hashSync(newPassword, 10), req.admin.id);

  res.json({ message: 'Password updated successfully' });
});

// POST /api/auth/create-admin — super_admin only
router.post('/create-admin', requireAuth, (req, res) => {
  if (req.admin.role !== 'super_admin')
    return res.status(403).json({ error: 'Only super admins can create admin accounts' });

  const { username, email, password, role } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Username, email and password required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const validRoles = ['super_admin', 'site_manager', 'viewer'];
  if (role && !validRoles.includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  const existing = db.prepare('SELECT id FROM admins WHERE username = ? OR email = ?')
    .get(username, email);
  if (existing)
    return res.status(409).json({ error: 'Username or email already exists' });

  const hashed = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO admins (username, email, password, role)
    VALUES (?, ?, ?, ?)
  `).run(username, email, hashed, role || 'viewer');

  res.status(201).json({ message: `Admin account created for ${username}` });
});

// GET /api/auth/admins — list all admins (super_admin only)
router.get('/admins', requireAuth, (req, res) => {
  if (req.admin.role !== 'super_admin')
    return res.status(403).json({ error: 'Forbidden' });

  const admins = db.prepare(
    'SELECT id, username, email, role, created_at, last_login FROM admins ORDER BY created_at ASC'
  ).all();
  res.json(admins);
});

// DELETE /api/auth/admins/:id — super_admin only, cannot delete self
router.delete('/admins/:id', requireAuth, (req, res) => {
  if (req.admin.role !== 'super_admin')
    return res.status(403).json({ error: 'Forbidden' });
  if (req.params.id === req.admin.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });

  const admin = db.prepare('SELECT id FROM admins WHERE id = ?').get(req.params.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });

  db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
  res.json({ message: 'Admin deleted' });
});

module.exports = router;