const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '../../data/monarch.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);


// ── Safe column additions (idempotent — skip if already exists) ──
const safeAlter = (sql) => {
  try { db.prepare(sql).run(); } catch(e) { /* column already exists */ }
};

safeAlter('ALTER TABLE packages ADD COLUMN device_limit INTEGER NOT NULL DEFAULT 1');
safeAlter('ALTER TABLE sessions ADD COLUMN client_mac TEXT');
safeAlter('ALTER TABLE sessions ADD COLUMN ap_mac TEXT');
safeAlter('ALTER TABLE sessions ADD COLUMN ssid_name TEXT');
safeAlter('ALTER TABLE sessions ADD COLUMN radio_id INTEGER');
safeAlter('ALTER TABLE sessions ADD COLUMN omada_authed INTEGER NOT NULL DEFAULT 0');
safeAlter('ALTER TABLE sessions ADD COLUMN omada_auth_method TEXT');
safeAlter('ALTER TABLE sessions ADD COLUMN warned_expiry INTEGER NOT NULL DEFAULT 0');
safeAlter('ALTER TABLE mpesa_transactions ADD COLUMN client_mac TEXT');
safeAlter('ALTER TABLE mpesa_transactions ADD COLUMN ap_mac TEXT');
safeAlter('ALTER TABLE mpesa_transactions ADD COLUMN ssid_name TEXT');
safeAlter('ALTER TABLE mpesa_transactions ADD COLUMN radio_id INTEGER');
safeAlter('ALTER TABLE mpesa_transactions ADD COLUMN provider TEXT');
safeAlter('ALTER TABLE admins ADD COLUMN reset_token TEXT');
safeAlter('ALTER TABLE admins ADD COLUMN reset_token_expires TEXT');
safeAlter('ALTER TABLE admins ADD COLUMN phone TEXT');

// Ensure expenses table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    label        TEXT NOT NULL,
    amount       REAL NOT NULL DEFAULT 0,
    category     TEXT NOT NULL DEFAULT 'other',
    is_monthly   INTEGER NOT NULL DEFAULT 1,
    amort_months INTEGER,
    is_active    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );
`);
const seedExpense = db.prepare(`
  INSERT OR IGNORE INTO expenses (id, label, amount, category, is_monthly, amort_months)
  VALUES (?, ?, 0, ?, ?, ?)
`);
seedExpense.run('isp-default', 'ISP / Internet',   'isp',      1, null);
seedExpense.run('hw-default',  'Hardware (Omada)', 'hardware', 0, 24);
seedExpense.run('vps-default', 'VPS Hosting',      'vps',      1, null);

// Ensure payment_config table exists (for installs before this feature)
db.exec(`
  CREATE TABLE IF NOT EXISTS payment_config (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    key         TEXT NOT NULL UNIQUE,
    value       TEXT,
    label       TEXT NOT NULL,
    description TEXT,
    is_secret   INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT DEFAULT (datetime('now'))
  );
`);
const seedPaymentConfig = db.prepare(`
  INSERT OR IGNORE INTO payment_config (key, label, description, is_secret) VALUES (?, ?, ?, ?)
`);
[
  ['mpesa_env',             'Environment',          'sandbox or production',          0],
  ['mpesa_consumer_key',    'Consumer Key',         'Daraja API Consumer Key',        1],
  ['mpesa_consumer_secret', 'Consumer Secret',      'Daraja API Consumer Secret',     1],
  ['mpesa_shortcode',       'Shortcode',            'Till or Paybill number',         0],
  ['mpesa_passkey',         'Passkey',              'Lipa Na M-Pesa Online Passkey',  1],
  ['mpesa_callback_url',    'Callback URL',         'Publicly accessible HTTPS URL',  0],
].forEach(([key, label, desc, secret]) => seedPaymentConfig.run(key, label, desc, secret));

// Seed SMTP config keys — INSERT OR IGNORE so existing values are never overwritten
[
  ['smtp_host', 'SMTP Host',     'e.g. smtp.gmail.com',                 0],
  ['smtp_port', 'SMTP Port',     '587 for TLS, 465 for SSL',            0],
  ['smtp_user', 'SMTP Username', 'Your email address',                  0],
  ['smtp_pass', 'SMTP Password', 'App password (not account password)', 1],
  ['smtp_from', 'From Name',     'Sender name e.g. Monarch Wireless',   0],
].forEach(([key, label, desc, secret]) => seedPaymentConfig.run(key, label, desc, secret));

// Also ensure smtp rows exist for existing databases (runs every boot safely)
const ensureSmtp = db.prepare(`
  INSERT OR IGNORE INTO payment_config (key, label, description, is_secret)
  VALUES (?, ?, ?, ?)
`);
[
  ['smtp_host', 'SMTP Host',     'e.g. smtp.gmail.com',                 0],
  ['smtp_port', 'SMTP Port',     '587 for TLS, 465 for SSL',            0],
  ['smtp_user', 'SMTP Username', 'Your email address',                  0],
  ['smtp_pass', 'SMTP Password', 'App password (not account password)', 1],
  ['smtp_from', 'From Name',     'Sender name e.g. Monarch Wireless',   0],
].forEach(([key, label, desc, secret]) => ensureSmtp.run(key, label, desc, secret));

// Seed default data if fresh database
function seedDefaults() {
  // Check if already seeded
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get();
  if (adminCount.count > 0) return;

  console.log('🌱 Seeding default data...');

  // Default super admin
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO admins (username, email, password, role)
    VALUES (?, ?, ?, ?)
  `).run('admin', 'admin@monarchwireless.co.ke', hashedPassword, 'super_admin');

  // Default site — Designers Hotspot
  const siteId = db.prepare(`
    INSERT INTO sites (name, address, monthly_isp_cost, hardware_cost)
    VALUES (?, ?, ?, ?)
  `).run('Designers Hotspot', 'Nairobi', 1500, 20000).lastInsertRowid;

  // Get the actual site id
  const site = db.prepare('SELECT id FROM sites WHERE name = ?').get('Designers Hotspot');

  // Default packages (matching your real packages)
  const packages = [
    { name: 'Power Hour',  price: 10,  duration: 60,   points: 1  },
    { name: 'Half Day',    price: 20,  duration: 240,  points: 2  },
    { name: 'Daily Rush',  price: 30,  duration: 1440, points: 3  },
    { name: 'Weekly',      price: 130, duration: 10080, points: 13 },
  ];

  const insertPackage = db.prepare(`
    INSERT INTO packages (site_id, name, price, duration_minutes, loyalty_points)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const pkg of packages) {
    insertPackage.run(site.id, pkg.name, pkg.price, pkg.duration, pkg.points);
  }

  console.log('✅ Default data seeded.');
  console.log('   Admin login: admin / admin123');
  console.log('   Site: Designers Hotspot, Nairobi');
  console.log('   Packages: Power Hour, Half Day, Daily Rush, Weekly');
}


// Seed punchcard SMS templates if not present
const seedSmsTemplates = [
  {
    name:    'punchcard_progress',
    label:   'Punchcard Progress Reminder',
    content: 'Hi! You have [[sessions_left]] session(s) to go before earning a FREE session on [[company]]. Keep it up! 🎯',
  },
  {
    name:    'punchcard_milestone',
    label:   'Punchcard Free Session Earned',
    content: '🎉 Congrats! You have completed [[target]] sessions on [[company]]! You have earned a FREE [[package]] session. Voucher code: [[code]]. Valid until [[expiry]]. Enjoy! 🌐',
  },
];
try {
  const insertTmpl = db.prepare(
    'INSERT OR IGNORE INTO sms_templates (name, label, content, is_active) VALUES (?, ?, ?, 1)'
  );
  for (const t of seedSmsTemplates) insertTmpl.run(t.name, t.label, t.content);
} catch(e) { /* table not ready yet */ }

seedDefaults();

module.exports = db;

// ── Ensure payment_providers table exists ─────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS payment_providers (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name        TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    description TEXT,
    is_active   INTEGER NOT NULL DEFAULT 0,
    is_default  INTEGER NOT NULL DEFAULT 0,
    config      TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Seed default payment providers
const seedProvider = db.prepare(`
  INSERT OR IGNORE INTO payment_providers (name, label, description, is_active, is_default)
  VALUES (?, ?, ?, ?, ?)
`);
seedProvider.run('mpesa',    'M-Pesa (Daraja)',  'Safaricom M-Pesa STK Push via Daraja API', 1, 1);
seedProvider.run('kopokopo', 'KopoKopo (K2)',    'KopoKopo STK Push via K2 Connect API',     0, 0);

// ── Host management migrations ────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS ap_admins (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    admin_id   TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    ap_mac     TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(admin_id, ap_mac)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ap_package_overrides (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    ap_mac     TEXT NOT NULL,
    package_id TEXT NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    price      REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(ap_mac, package_id)
  )
`);

// Add revenue_share_pct to access_points
safeAlter('ALTER TABLE access_points ADD COLUMN revenue_share_pct REAL NOT NULL DEFAULT 70');
safeAlter('ALTER TABLE access_points ADD COLUMN host_name TEXT');
safeAlter('ALTER TABLE access_points ADD COLUMN host_phone TEXT');

// Ensure sessions has ap_mac (may already exist)
safeAlter('ALTER TABLE sessions ADD COLUMN ap_mac TEXT');

// ── Roaming support ───────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS session_roam_log (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    from_ap_mac TEXT,
    to_ap_mac   TEXT,
    roamed_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
db.prepare('CREATE INDEX IF NOT EXISTS idx_roam_session ON session_roam_log(session_id)').run();