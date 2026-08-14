const express    = require('express');
const db         = require('../db');
const { scoreCheckin } = require('../lib/riskEngine');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// All routes require auth
router.use(requireAuth);

// ── POST /api/checkins ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { mood, phq1, phq2, freeText = '' } = req.body;

  if (mood === undefined || phq1 === undefined || phq2 === undefined)
    return res.status(400).json({ error: 'mood, phq1, and phq2 are required.' });

  // Consent guard (server-side, enforced on every submission)
  const user = db.prepare('SELECT consent_given, role FROM users WHERE id = ?').get(req.user.id);
  if (user.role === 'employee' && !user.consent_given)
    return res.status(403).json({ error: 'Check-in blocked: consent not on record.' });

  const result = scoreCheckin({ mood, phq1, phq2, text: freeText });
  const {
    riskScore, riskLevel, crisisFlag, sentimentScore,
    coreKeyword, dominant, rationale
  } = result;

  // Persist checkin
  const ins = db.prepare(`
    INSERT INTO checkins
      (user_id, mood_score, phq_interest, phq_mood, free_text,
       sentiment_score, risk_score, risk_level, crisis_flag, core_keyword, dominant_factor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id, mood, phq1, phq2, freeText,
    sentimentScore, riskScore, riskLevel, crisisFlag ? 1 : 0,
    coreKeyword, dominant
  );

  const checkinId = ins.lastInsertRowid;
  let alert = null;

  // High-risk → create alert for coordinator
  if (riskLevel === 'high') {
    const alertIns = db.prepare(`
      INSERT INTO alerts (checkin_id, user_id) VALUES (?, ?)
    `).run(checkinId, req.user.id);
    alert = { id: alertIns.lastInsertRowid, status: 'open' };
  }

  // Micro-intervention for low/moderate
  const EXERCISES = {
    boxBreathing:   { title: 'Box breathing',        body: 'Inhale 4 counts, hold 4, exhale 4, hold 4. Repeat for two minutes.' },
    grounding54321: { title: '5-4-3-2-1 grounding',  body: 'Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste.' },
    shortWalk:      { title: 'Take a short walk',     body: 'Five minutes outside or down the hallway — a change of scene helps.' },
    journaling:     { title: 'Journal it down',       body: 'Write one thing weighing on you and one small thing that is going okay.' },
  };
  const pickEx = (level, dom) => {
    if (level === 'moderate') {
      if (dom === 'sentiment') return EXERCISES.grounding54321;
      if (dom === 'phq')       return EXERCISES.boxBreathing;
      return EXERCISES.shortWalk;
    }
    if (dom === 'sentiment') return EXERCISES.journaling;
    if (dom === 'mood')      return EXERCISES.shortWalk;
    return EXERCISES.boxBreathing;
  };

  const intervention = riskLevel !== 'high' ? pickEx(riskLevel, dominant) : null;

  return res.status(201).json({
    checkinId,
    riskScore,
    riskLevel,
    crisisFlag,
    rationale,
    intervention,
    alert,
  });
});

// ── GET /api/checkins/me ─────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.user.id);
  return res.json(rows);
});

// ── GET /api/checkins/all  (coordinator only) ────────────────────────────────
router.get('/all', requireRole('coordinator'), (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.name as user_name
    FROM checkins c
    JOIN users u ON u.id = c.user_id
    ORDER BY c.created_at DESC
    LIMIT 200
  `).all();
  return res.json(rows);
});

module.exports = router;
