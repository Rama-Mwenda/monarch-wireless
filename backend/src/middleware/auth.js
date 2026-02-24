const jwt = require('jsonwebtoken');
const db = require('../db');

// Verify JWT token on protected routes
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Attach admin info to request
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restrict to specific roles
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.admin?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Log admin actions to audit trail
function auditLog(action, getTarget) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      // Only log on success responses
      if (res.statusCode < 400 && req.admin) {
        try {
          db.prepare(`
            INSERT INTO audit_log (admin_id, action, target, detail, ip)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            req.admin.id,
            action,
            getTarget ? getTarget(req, data) : null,
            JSON.stringify({ body: req.body, params: req.params }),
            req.ip
          );
        } catch (e) {
          // Don't fail the request if audit logging fails
          console.error('Audit log error:', e.message);
        }
      }
      return originalJson(data);
    };
    next();
  };
}

module.exports = { requireAuth, requireRole, auditLog };
