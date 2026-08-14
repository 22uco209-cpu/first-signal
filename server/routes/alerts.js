const express  = require('express');
const db       = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('coordinator'));

// ── GET /api/alerts ──────────────────────────────────────────────────────────
// Optional ?status=open|reviewed|resolved
router.get('/', (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT a.*, u.name as user_name, c.risk_score, c.risk_level, c.mood_score,
           c.phq_interest, c.phq_mood, c.free_text, c.crisis_flag, c.core_keyword
    FROM alerts a
    JOIN users    u ON u.id = a.user_id
    JOIN checkins c ON c.id = a.checkin_id
  `;
  const params = [];
  if (status && ['open','reviewed','resolved'].includes(status)) {
    query += ' WHERE a.status = ?';
    params.push(status);
  }
  query += ' ORDER BY a.created_at DESC';

  return res.json(db.prepare(query).all(...params));
});

// ── PATCH /api/alerts/:id ────────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const { status, coordinator_notes } = req.body;
  const id = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Alert not found.' });

  if (status && !['open','reviewed','resolved'].includes(status))
    return res.status(400).json({ error: 'status must be open, reviewed, or resolved.' });

  const newStatus  = status || existing.status;
  const newNotes   = coordinator_notes !== undefined ? coordinator_notes : existing.coordinator_notes;
  const resolvedAt = newStatus === 'resolved' ? new Date().toISOString() : existing.resolved_at;

  db.prepare(`
    UPDATE alerts
    SET status = ?, coordinator_notes = ?, reviewed_by = ?, resolved_at = ?
    WHERE id = ?
  `).run(newStatus, newNotes, req.user.id, resolvedAt, id);

  return res.json({ id, status: newStatus, coordinator_notes: newNotes, resolved_at: resolvedAt });
});

module.exports = router;
