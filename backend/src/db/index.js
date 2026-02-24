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
  `).run('Monarch Wireless', 'Nairobi', 1500, 20000).lastInsertRowid;

  // Get the actual site id
  const site = db.prepare('SELECT id FROM sites WHERE name = ?').get('Monarch Wireless');

  // Default packages (matching your real packages)
  const packages = [
    { name: 'Power Hour',  price: 10,  duration: 60,   points: 1  },
    { name: 'Half Day',    price: 20,  duration: 240,  points: 2  },
    { name: 'Daily Rush',  price: 30,  duration: 1440, points: 3  },
    { name: 'Weekly',      price: 140, duration: 10080, points: 14 },
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
  console.log('   Site: Monarch Wireless, Nairobi');
  console.log('   Packages: Power Hour, Half Day, Daily Rush, Weekly');
}

seedDefaults();

module.exports = db;
