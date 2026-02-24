-- ============================================================
-- MONARCH WIRELESS — DATABASE SCHEMA
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- ADMINS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username    TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('super_admin','site_manager','viewer')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_login  TEXT
);

-- ------------------------------------------------------------
-- SITES (locations)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name              TEXT NOT NULL,
  address           TEXT,
  monthly_isp_cost  REAL NOT NULL DEFAULT 1500,
  hardware_cost     REAL NOT NULL DEFAULT 0,
  omada_site_id     TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- ACCESS POINTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_points (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  site_id         TEXT NOT NULL REFERENCES sites(id),
  name            TEXT NOT NULL,
  mac             TEXT UNIQUE,
  model           TEXT DEFAULT 'EAP610',
  omada_ap_id     TEXT,
  status          TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('online','offline','unknown')),
  connected_clients INTEGER DEFAULT 0,
  last_seen       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- PACKAGES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS packages (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  site_id             TEXT NOT NULL REFERENCES sites(id),
  name                TEXT NOT NULL,
  price               REAL NOT NULL,
  duration_minutes    INTEGER NOT NULL,
  data_cap_mb         INTEGER DEFAULT NULL,
  download_kbps       INTEGER DEFAULT NULL,
  upload_kbps         INTEGER DEFAULT NULL,
  loyalty_points      INTEGER NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1,
  is_promo            INTEGER NOT NULL DEFAULT 0,
  promo_start         TEXT,
  promo_end           TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- USERS (hotspot customers)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  phone           TEXT NOT NULL UNIQUE,
  name            TEXT,
  mac_address     TEXT,
  tier            TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze','silver','gold','platinum')),
  loyalty_points  INTEGER NOT NULL DEFAULT 0,
  total_spent     REAL NOT NULL DEFAULT 0,
  total_sessions  INTEGER NOT NULL DEFAULT 0,
  punch_count     INTEGER NOT NULL DEFAULT 0,
  opted_in_sms    INTEGER NOT NULL DEFAULT 1,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen       TEXT
);

-- ------------------------------------------------------------
-- VOUCHERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vouchers (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  code        TEXT NOT NULL UNIQUE,
  package_id  TEXT NOT NULL REFERENCES packages(id),
  site_id     TEXT NOT NULL REFERENCES sites(id),
  is_used     INTEGER NOT NULL DEFAULT 0,
  used_by     TEXT REFERENCES users(id),
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT
);

-- ------------------------------------------------------------
-- SESSIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id         TEXT NOT NULL REFERENCES users(id),
  site_id         TEXT NOT NULL REFERENCES sites(id),
  ap_id           TEXT REFERENCES access_points(id),
  package_id      TEXT NOT NULL REFERENCES packages(id),
  voucher_id      TEXT REFERENCES vouchers(id),
  mac_address     TEXT,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('mpesa','voucher','loyalty','free')),
  amount_paid     REAL NOT NULL DEFAULT 0,
  mpesa_ref       TEXT,
  loyalty_points_earned INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','terminated')),
  start_at        TEXT NOT NULL DEFAULT (datetime('now')),
  end_at          TEXT NOT NULL,
  terminated_at   TEXT
);

-- ------------------------------------------------------------
-- MPESA TRANSACTIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mpesa_transactions (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  checkout_request_id TEXT UNIQUE,
  merchant_request_id TEXT,
  phone             TEXT NOT NULL,
  amount            REAL NOT NULL,
  package_id        TEXT REFERENCES packages(id),
  site_id           TEXT REFERENCES sites(id),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','cancelled')),
  mpesa_receipt     TEXT,
  result_code       INTEGER,
  result_desc       TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);

-- ------------------------------------------------------------
-- SMS LOG
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_log (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id       TEXT REFERENCES users(id),
  phone         TEXT NOT NULL,
  message_type  TEXT NOT NULL,
  body          TEXT NOT NULL,
  provider      TEXT DEFAULT 'africas_talking',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed')),
  provider_id   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at  TEXT
);

-- ------------------------------------------------------------
-- AUDIT LOG
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  admin_id    TEXT REFERENCES admins(id),
  action      TEXT NOT NULL,
  target      TEXT,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_user     ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status   ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_end_at   ON sessions(end_at);
CREATE INDEX IF NOT EXISTS idx_vouchers_code     ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_users_phone       ON users(phone);
CREATE INDEX IF NOT EXISTS idx_sms_log_user      ON sms_log(user_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_checkout    ON mpesa_transactions(checkout_request_id);
