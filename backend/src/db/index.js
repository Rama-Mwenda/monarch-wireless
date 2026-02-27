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