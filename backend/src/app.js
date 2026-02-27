require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Security middleware ──────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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