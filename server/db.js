const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_PATH = path.resolve(process.env.DB_PATH || './data/first_signal.db');

// ── Why sql.js instead of better-sqlite3 ────────────────────────────────────
// better-sqlite3 needs a native C++ build step (Python + a compiler) that
// frequently fails on student laptops, especially Windows without build
// tools installed. sql.js is pure WebAssembly + JS — `npm install` just
// works everywhere, no compilation. We wrap it below so the rest of the
// app (routes/*.js) can keep using the same .prepare(sql).run()/.get()/.all()
// calls it already had.

let sqljsDb = null;

function persist() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const data = sqljsDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

const ready = initSqlJs({
  locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm'),
}).then((SQL) => {
  sqljsDb = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  sqljsDb.run('PRAGMA foreign_keys = ON;');

  sqljsDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      email           TEXT    NOT NULL UNIQUE,
      password_hash   TEXT    NOT NULL,
      role            TEXT    NOT NULL CHECK(role IN ('employee','coordinator')),
      consent_given   INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mood_score      INTEGER NOT NULL,
      phq_interest    INTEGER NOT NULL,
      phq_mood        INTEGER NOT NULL,
      free_text       TEXT,
      sentiment_score REAL,
      risk_score      REAL    NOT NULL,
      risk_level      TEXT    NOT NULL CHECK(risk_level IN ('low','moderate','high')),
      crisis_flag     INTEGER NOT NULL DEFAULT 0,
      core_keyword    TEXT,
      dominant_factor TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      checkin_id        INTEGER NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status            TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','resolved')),
      coordinator_notes TEXT,
      reviewed_by       INTEGER REFERENCES users(id),
      resolved_at       TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS logins (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      role        TEXT    NOT NULL,
      event       TEXT    NOT NULL CHECK(event IN ('signup','login')),
      user_status TEXT    NOT NULL CHECK(user_status IN ('new','existing')),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_checkins_user   ON checkins(user_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_status   ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_logins_user     ON logins(user_id);
  `);

  // ── Seed demo accounts (only if users table is empty) ──────────────────
  const countRes = sqljsDb.exec('SELECT COUNT(*) as n FROM users');
  const userCount = countRes.length ? countRes[0].values[0][0] : 0;

  if (userCount === 0) {
    const seedUsers = [
      { name: 'Care Coordinator', email: 'coordinator@demo.com', password: 'ChangeMe123!', role: 'coordinator', consent: 0 },
      { name: 'Priya Sharma',     email: 'priya@demo.com',       password: 'password123',  role: 'employee',    consent: 1 },
      { name: 'Rahul Mehta',      email: 'rahul@demo.com',       password: 'password123',  role: 'employee',    consent: 1 },
    ];
    const stmt = sqljsDb.prepare(
      'INSERT INTO users (name, email, password_hash, role, consent_given) VALUES (?, ?, ?, ?, ?)'
    );
    seedUsers.forEach(u => {
      const hash = bcrypt.hashSync(u.password, 10);
      stmt.run([u.name, u.email, hash, u.role, u.consent]);
    });
    stmt.free();
    console.log('✔ Seeded 3 demo users (coordinator, priya, rahul)');
  }

  persist();
});

// ── better-sqlite3-compatible API ───────────────────────────────────────────
// .prepare(sql) -> { run(...args), get(...args), all(...args) }
// This mirrors the subset of better-sqlite3's API the routes already use,
// so no other file in the project needs to change.

const db = {
  ready,

  prepare(sql) {
    return {
      run(...args) {
        sqljsDb.run(sql, args);
        // IMPORTANT: last_insert_rowid() must be read immediately after the
        // write, BEFORE persist()/export() — calling .export() resets sql.js's
        // internal rowid tracking back to 0.
        const idRes = sqljsDb.exec('SELECT last_insert_rowid() as id');
        const lastInsertRowid = idRes.length ? idRes[0].values[0][0] : undefined;
        const changes = sqljsDb.getRowsModified();
        persist();
        return { lastInsertRowid, changes };
      },
      get(...args) {
        const stmt = sqljsDb.prepare(sql);
        stmt.bind(args);
        let result;
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const row = stmt.get();
          result = {};
          cols.forEach((c, i) => { result[c] = row[i]; });
        }
        stmt.free();
        return result;
      },
      all(...args) {
        const stmt = sqljsDb.prepare(sql);
        stmt.bind(args);
        const cols = stmt.getColumnNames();
        const rows = [];
        while (stmt.step()) {
          const row = stmt.get();
          const obj = {};
          cols.forEach((c, i) => { obj[c] = row[i]; });
          rows.push(obj);
        }
        stmt.free();
        return rows;
      },
    };
  },
};

module.exports = db;
