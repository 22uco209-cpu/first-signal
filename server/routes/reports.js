const express  = require('express');
const db       = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('coordinator'));

// ── GET /api/reports/summary ─────────────────────────────────────────────────
router.get('/summary', (req, res) => {
  const totalUsers       = db.prepare("SELECT COUNT(*) as n FROM users WHERE role='employee'").get().n;
  const totalCheckins    = db.prepare('SELECT COUNT(*) as n FROM checkins').get().n;
  const totalEscalations = db.prepare('SELECT COUNT(*) as n FROM alerts').get().n;
  const avgScore         = db.prepare('SELECT AVG(risk_score) as avg FROM checkins').get().avg || 0;

  const byLevel = db.prepare(`
    SELECT risk_level, COUNT(*) as n FROM checkins GROUP BY risk_level
  `).all().reduce((acc, r) => { acc[r.risk_level] = r.n; return acc; }, { low:0, moderate:0, high:0 });

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as n FROM alerts GROUP BY status
  `).all().reduce((acc, r) => { acc[r.status] = r.n; return acc; }, { open:0, reviewed:0, resolved:0 });

  const perEmployee = db.prepare(`
    SELECT u.id, u.name,
           COUNT(c.id) as checkin_count,
           ROUND(AVG(c.risk_score)*100, 0) as avg_score
    FROM users u
    LEFT JOIN checkins c ON c.user_id = u.id
    WHERE u.role = 'employee'
    GROUP BY u.id
  `).all();

  const trend = db.prepare(`
    SELECT ROUND(risk_score*100,0) as score, created_at
    FROM checkins ORDER BY created_at ASC LIMIT 100
  `).all();

  return res.json({
    totalUsers, totalCheckins, totalEscalations,
    avgScore: Math.round(avgScore * 100),
    byLevel, byStatus, perEmployee, trend,
  });
});

// ── GET /api/reports/logins ──────────────────────────────────────────────────
router.get('/logins', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM logins ORDER BY created_at DESC LIMIT 50'
  ).all();
  return res.json(rows);
});

module.exports = router;
