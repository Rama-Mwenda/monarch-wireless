const express    = require('express');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const db         = require('../db');
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

// ── POST /api/auth/login ──────────────────────────────────────
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

  // Force password change if: using default password OR first ever login (new account)
  const isDefaultPassword = bcrypt.compareSync('admin123', admin.password);
  const isFirstLogin = !admin.last_login;

  res.json({
    token,
    mustChangePassword: isDefaultPassword || isFirstLogin,
    admin: {
      id:       admin.id,
      username: admin.username,
      email:    admin.email,
      role:     admin.role,
    },
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const admin = db.prepare(
    'SELECT id, username, email, role, created_at, last_login FROM admins WHERE id = ?'
  ).get(req.admin.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  res.json(admin);
});

// ── POST /api/auth/change-password ───────────────────────────
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

// ── POST /api/auth/create-admin ───────────────────────────────
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

// ── GET /api/auth/admins ──────────────────────────────────────
router.get('/admins', requireAuth, (req, res) => {
  if (req.admin.role !== 'super_admin')
    return res.status(403).json({ error: 'Forbidden' });

  const admins = db.prepare(
    'SELECT id, username, email, role, created_at, last_login FROM admins ORDER BY created_at ASC'
  ).all();
  res.json(admins);
});

// ── DELETE /api/auth/admins/:id ───────────────────────────────
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

// ── Email helpers ─────────────────────────────────────────────
function getMailConfig() {
  let cfg = {};
  try {
    const rows = db.prepare("SELECT key, value FROM payment_config WHERE key LIKE 'smtp_%'").all();
    cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  } catch {}
  return {
    host:     cfg.smtp_host || process.env.SMTP_HOST || 'srv-de01.kickhost.com',
    port:     Number(cfg.smtp_port || process.env.SMTP_PORT || 465),
    user:     cfg.smtp_user || process.env.SMTP_USER || '',
    pass:     cfg.smtp_pass || process.env.SMTP_PASS || '',
    fromName: cfg.smtp_from || process.env.SMTP_FROM || 'Monarch Wireless',
  };
}

function getMailTransporter() {
  const { host, port, user, pass } = getMailConfig();
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?')
    .get(email.toLowerCase().trim());

  // Always return success — prevents email enumeration
  if (!admin) return res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.prepare('UPDATE admins SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
    .run(token, expires, admin.id);

  const baseUrl  = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  const mailCfg  = getMailConfig();

  getMailTransporter().sendMail({
    from:    `"${mailCfg.fromName}" <${mailCfg.user}>`,
    to:      admin.email,
    subject: 'Monarch Wireless — Password Reset',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <div style="background:#f0a500;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
          <span style="font-size:28px;font-weight:900;color:#000">🦋 Monarch Wireless</span>
        </div>
        <h2 style="color:#111;margin-bottom:8px">Password Reset Request</h2>
        <p style="color:#555;margin-bottom:24px">
          Hi <strong>${admin.username}</strong>, we received a request to reset your admin password.
          Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetUrl}"
          style="display:inline-block;background:#f0a500;color:#000;font-weight:700;
                 padding:14px 28px;border-radius:8px;text-decoration:none;font-size:15px">
          Reset My Password
        </a>
        <p style="color:#999;font-size:12px;margin-top:24px">
          If you didn't request this, you can safely ignore this email.<br/>
          This link will expire at ${new Date(expires).toLocaleString('en-KE')}.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
        <p style="color:#bbb;font-size:11px;text-align:center">
          Monarch Wireless · Designers Hotspot · Nairobi
        </p>
      </div>
    `,
  }).then(() => {
    console.log(`Password reset email sent to ${admin.email}`);
  }).catch(err => {
    console.error('Failed to send reset email:', err.message);
  });

  res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
});

// ── GET /api/auth/mail-config-debug — check what SMTP values are loaded ──
router.get('/mail-config-debug', requireAuth, (req, res) => {
  const cfg = getMailConfig();
  res.json({
    host:      cfg.host,
    port:      cfg.port,
    user:      cfg.user,
    pass:      cfg.pass ? '••••' + cfg.pass.slice(-4) : '(empty)',
    fromName:  cfg.fromName,
    secure:    cfg.port === 465,
  });
});

// ── POST /api/auth/test-email ─────────────────────────────────
router.post('/test-email', requireAuth, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient email required' });
  try {
    const mailCfg = getMailConfig();
    await getMailTransporter().sendMail({
      from:    `"${mailCfg.fromName}" <${mailCfg.user}>`,
      to,
      subject: 'Monarch Wireless — SMTP Test',
      html: `
        <div style="font-family:Arial,sans-serif;padding:24px">
          <h2>✅ SMTP Test Successful</h2>
          <p>Your email configuration is working correctly.</p>
          <p style="color:#999;font-size:12px">Monarch Wireless · Designers Hotspot · Nairobi</p>
        </div>
      `,
    });
    res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch(err) {
    console.error('SMTP error full:', err);
    res.status(400).json({
      error: `Email failed: ${err.message}`,
      code:  err.code,
      smtp:  getMailConfig().host + ':' + getMailConfig().port,
      user:  getMailConfig().user || '(no user set)',
    });
  }
});

// ── GET /api/auth/verify-reset-token ─────────────────────────
router.get('/verify-reset-token', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const admin = db.prepare(
    'SELECT id, username, email, reset_token_expires FROM admins WHERE reset_token = ?'
  ).get(token);

  if (!admin)
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  if (new Date(admin.reset_token_expires) < new Date())
    return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

  res.json({ ok: true, username: admin.username, email: admin.email });
});

// ── POST /api/auth/reset-password ────────────────────────────
router.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword)
    return res.status(400).json({ error: 'Token and new password required' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const admin = db.prepare('SELECT * FROM admins WHERE reset_token = ?').get(token);
  if (!admin)
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  if (new Date(admin.reset_token_expires) < new Date())
    return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

  db.prepare(`
    UPDATE admins SET
      password            = ?,
      reset_token         = NULL,
      reset_token_expires = NULL,
      updated_at          = datetime('now')
    WHERE id = ?
  `).run(bcrypt.hashSync(newPassword, 10), admin.id);

  console.log(`Password reset successful for admin: ${admin.username}`);
  res.json({ ok: true, message: 'Password reset successfully. You can now log in.' });
});

module.exports = router;