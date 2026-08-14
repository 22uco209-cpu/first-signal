# First Signal — Full-Stack Setup

## Quick Start (on your laptop)

```bash
# 1. Make sure Node.js is installed (v16 or above)
node --version

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open in browser
http://localhost:3000
```

That's it — no Python, no build tools, no compiler needed. The database
(`sql.js`) is pure JavaScript/WebAssembly, so `npm install` works the
same way on Windows, Mac, and Linux without any extra setup.

Your data is saved to `data/first_signal.db` and reloads automatically
every time you restart the server — nothing is lost between runs.

## Demo Accounts

| Email | Role | Password |
|---|---|---|
| coordinator@demo.com | Coordinator | ChangeMe123! |
| priya@demo.com | Employee | password123 |
| rahul@demo.com | Employee | password123 |

## Stack
- **Backend:** Node.js + Express 4
- **Database:** SQLite via sql.js (pure JS/WASM — no native compilation required)
- **Auth:** JWT + bcryptjs
- **Frontend:** Plain HTML/CSS/JS (in `/public/index.html`)

## API Endpoints
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/checkins`
- `GET  /api/checkins/me`
- `GET  /api/checkins/all` *(coordinator only)*
- `GET  /api/alerts` *(coordinator only)*
- `PATCH /api/alerts/:id` *(coordinator only)*
- `GET  /api/reports/summary` *(coordinator only)*
- `GET  /api/reports/logins` *(coordinator only)*
- `GET  /api/health`

## If something goes wrong
- **"Cannot connect" in the browser** — make sure the terminal still shows
  `✅ First Signal running at http://localhost:3000` and you didn't close it.
- **Port already in use** — another process is using port 3000. Either close
  it, or set `PORT=3001` in `.env` and restart.
- **Fresh demo data** — delete the `data/` folder and restart the server;
  it will re-seed the three demo accounts automatically.

## Project: CIA-2
CHRIST (Deemed to be University), Bangalore
Anuraag Nambiar · Jithin Francis A · Ponnuru Praneeth Chandra
Guide: Dr. Shailendra Kadre

---

## Deploying it as a real public website

### 1. Push to GitHub
Create a repo and push this folder. The included `.gitignore` already
excludes `.env`, `node_modules/`, and `data/` — never commit real secrets.

### 2. Deploy on Render.com (free tier)
- Sign up at render.com and connect your GitHub repo
- Render will detect the included `render.yaml` and auto-configure:
  - Build command: `npm install`
  - Start command: `npm start`
  - A persistent 1GB disk mounted at `/data` (so the database survives restarts/redeploys)
  - A generated `JWT_SECRET`
- You'll be prompted to set `ALLOWED_ORIGIN` — enter your Render URL once you have it
  (e.g. `https://first-signal.onrender.com`), then redeploy

### 3. Test the live URL
Repeat the signup → check-in → coordinator alert flow against the real URL.

### 4. Optional: custom domain
Point a purchased domain (e.g. from Namecheap) at your Render service from
its dashboard, and update `ALLOWED_ORIGIN` to match.

### Notes on going public
- Free-tier Render services "sleep" after inactivity and take ~30s to wake
  on the first request — fine for a demo, worth knowing about
- The demo accounts (`priya@demo.com` etc.) are seeded automatically on
  first run — change or remove them before sharing the link widely
- This app surfaces crisis-risk language in check-ins. If real people will
  use it, make sure a real coordinator is actually monitoring the alerts —
  the in-app crisis helpline note is a safety net, not a substitute for that

