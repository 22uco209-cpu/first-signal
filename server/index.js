require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const rateLimit = require('express-rate-limit');
const db      = require('./db');

const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
// In local dev (no ALLOWED_ORIGIN set) this allows any origin, which is fine
// on your laptop. In production, set ALLOWED_ORIGIN to your real domain
// (e.g. https://firstsignal.onrender.com) so only your own frontend can call
// the API.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));

// ── Rate limiting on auth routes ────────────────────────────────────────────
// Slows down brute-force login/signup attempts once this is reachable by
// anyone on the internet. 20 requests per 15 minutes per IP is generous for
// a real user, but blocks scripted guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});
app.use('/api/auth', authLimiter);

app.use(express.json());

// ── Serve the frontend (the HTML file goes in /public) ───────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/checkins', require('./routes/checkins'));
app.use('/api/alerts',   require('./routes/alerts'));
app.use('/api/reports',  require('./routes/reports'));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Catch-all: serve frontend for any unknown route ──────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Start (wait for the database to finish loading first) ──────────────────
const PORT = process.env.PORT || 3000;
db.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅ First Signal running at http://localhost:${PORT}`);
    console.log(`   API base: http://localhost:${PORT}/api`);
    if (!process.env.ALLOWED_ORIGIN) {
      // Only show demo credentials when running locally without a configured
      // production origin — keeps them out of public server logs.
      console.log(`   Seeded accounts:`);
      console.log(`     coordinator@demo.com / ChangeMe123!`);
      console.log(`     priya@demo.com       / password123`);
      console.log(`     rahul@demo.com       / password123\n`);
    }
  });
}).catch((err) => {
  console.error('❌ Failed to start database:', err);
  process.exit(1);
});
