const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
require('dotenv').config();

// Fallback so the app still runs even if .env is missing/misplaced
const JWT_SECRET = process.env.JWT_SECRET || 'first-signal-cia2-super-secret-key-change-if-you-want';

const router = express.Router();

// ── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', (req, res) => {
  const { name, email, password, role = 'employee', consentGiven = false } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email, and password are required.' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  if (!['employee', 'coordinator'].includes(role))
    return res.status(400).json({ error: 'Role must be employee or coordinator.' });

  if (role === 'employee' && !consentGiven)
    return res.status(400).json({ error: 'Employee accounts require consentGiven: true.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already registered.' });

  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, consent_given) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email.toLowerCase(), password_hash, role, consentGiven ? 1 : 0);

  const user = { id: result.lastInsertRowid, name, email: email.toLowerCase(), role };

  // Log the signup event
  db.prepare(
    'INSERT INTO logins (user_id, name, role, event, user_status) VALUES (?, ?, ?, ?, ?)'
  ).run(user.id, user.name, user.role, 'signup', 'new');

  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });
  return res.status(201).json({ token, user });
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required.' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!row) return res.status(401).json({ error: 'Invalid email or password.' });

  const valid = bcrypt.compareSync(password, row.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

  const user = { id: row.id, name: row.name, email: row.email, role: row.role };

  // Determine user_status (new = first login ever, existing = has logged in before)
  const prevLogin = db.prepare(
    "SELECT id FROM logins WHERE user_id = ? AND event = 'login' LIMIT 1"
  ).get(row.id);
  const userStatus = prevLogin ? 'existing' : 'new';

  db.prepare(
    'INSERT INTO logins (user_id, name, role, event, user_status) VALUES (?, ?, ?, ?, ?)'
  ).run(user.id, user.name, user.role, 'login', userStatus);

  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '8h' });
  return res.json({ token, user });
});

module.exports = router;
