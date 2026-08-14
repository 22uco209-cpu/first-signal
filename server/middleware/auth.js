const jwt = require('jsonwebtoken');
require('dotenv').config();

// Fallback so the app still runs even if .env is missing/misplaced
const JWT_SECRET = process.env.JWT_SECRET || 'first-signal-cia2-super-secret-key-change-if-you-want';

/**
 * requireAuth — verifies Bearer JWT and attaches decoded user to req.user
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * requireRole — must be used after requireAuth
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient role.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
