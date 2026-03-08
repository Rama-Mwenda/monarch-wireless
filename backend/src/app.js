require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Trust Cloudflare Tunnel / reverse proxy — required for rate limiting
// and correct IP detection behind Cloudflare
app.set('trust proxy', 1);


// Block viewers from any mutating request (POST/PUT/PATCH/DELETE)
// Exception: password change is handled within the route itself
app.use((req, res, next) => {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutating.includes(req.method)) return next();

  // Only applies to authenticated requests
  const header = req.headers.authorization;
  if (!header) return next(); // let requireAuth handle unauthenticated

  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (payload.role === 'viewer') {
      // Allow password change only
      if (req.path === '/api/auth/change-password') return next();
      return res.status(403).json({ error: 'Viewers cannot make changes' });
    }
  } catch { /* invalid token — let requireAuth handle it */ }
  next();
});

// ── Security middleware ──────────────────────────────────────
// Portal needs relaxed CSP (inline scripts + onclick handlers + plain HTTP)
// All API routes get full strict helmet
app.use((req, res, next) => {
  if (req.path.startsWith('/portal')) {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc:      ["'self'"],
          scriptSrc:       ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
          scriptSrcAttr:   ["'unsafe-inline'"],
          styleSrc:        ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc:         ["'self'", 'https://fonts.gstatic.com'],
          imgSrc:          ["'self'", 'data:'],
          connectSrc:      ["'self'"],
          frameAncestors:       ["'none'"],
          upgradeInsecureRequests: [],  // don't force HTTPS on captive portal
        },
      },
      crossOriginOpenerPolicy:  false,
      crossOriginEmbedderPolicy: false,
    })(req, res, next);
  }
  // Full strict helmet for all API routes
  return helmet()(req, res, next);
});
app.use(cors({
  origin: [
    process.env.FRONTEND_URL      || 'http://localhost:5173',
    process.env.DASHBOARD_URL     || 'http://localhost:5173',
    'https://dashboard.monarchdesigners.co.ke',
    'http://localhost:5173',
  ],
  credentials: true,
}));
app.use(express.json());

// Global rate limit — 200 requests per 15 min per IP
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

// ── Static files (captive portal) ────────────────────────────
const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/packages',  require('./routes/packages'));
app.use('/api/vouchers',  require('./routes/vouchers'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/network',   require('./routes/network'));
app.use('/api/mpesa',     require('./routes/mpesa'));
app.use('/api/sms',       require('./routes/sms-settings'));
app.use('/api/payment',    require('./routes/payment-settings'));
app.use('/api/payment',    require('./routes/payment-providers'));
app.use('/api/hosts',      require('./routes/hosts'));
app.use('/portal',        require('./routes/portal'));

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Monarch Wireless API',
    timestamp: new Date().toISOString(),
  });
});

// ── 404 handler ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('  🦋 Monarch Wireless API');
  console.log(`  📡 Running at http://localhost:${PORT}`);
  console.log(`  🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  🗄️  Database: ./data/monarch.db`);
  console.log('');
  console.log('  Default admin: admin / admin123');
  console.log('  Change this password immediately!');
  console.log('');
});

// ── Start session expiry cron ────────────────────────────────
const sessionExpiry = require('./jobs/session-expiry');
sessionExpiry.start();

module.exports = app;