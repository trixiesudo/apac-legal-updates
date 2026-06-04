# Deployment

This project deploys as two separate pieces:

- Static frontend from `frontend/` on GitHub Pages.
- FastAPI backend from `backend/` on Render Free.

The frontend is plain HTML/CSS/JavaScript. Do not use React or Vite deployment steps.

## Local Development

Run the backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Run the frontend:

```powershell
cd frontend
python -m http.server 5174 --bind 127.0.0.1
```

Open `http://127.0.0.1:5174`.

For local development, `frontend/config.js` points to `http://127.0.0.1:8000`.

## Public Content Model

The public website reads only:

```text
GET /api/newsletters
```

Raw fetched legal updates, Legal AI source rows, source health, refresh actions, AI digest source scans, and desktop Outlook drafting are not exposed when `LEGAL_UPDATES_PUBLIC_MODE=true`.

Create or update a published newsletter locally:

```powershell
cd backend
python publish_newsletter.py --title "APAC Legal Updates - 04 Jun 2026" --summary "Published public briefing." --html-file briefing.html --text-file briefing.txt
```

You can also create one via the local/admin API while public mode is off:

```powershell
curl -X POST http://127.0.0.1:8000/api/admin/newsletters/publish ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"APAC Legal Updates\",\"summary\":\"Published briefing\",\"html_body\":\"<p>Briefing</p>\",\"text_body\":\"Briefing\",\"status\":\"published\"}"
```

## Deploy Backend To Render

1. Push this repository to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Use the included `render.yaml`.
4. Confirm these Render settings:

```text
Root directory: backend
Build command: pip install -r requirements.txt
Start command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

5. Set environment variables in Render:

```text
LEGAL_UPDATES_PUBLIC_MODE=true
LEGAL_UPDATES_ENABLE_SCHEDULER=false
LEGAL_UPDATES_CORS_ORIGINS=https://YOUR-GITHUB-USERNAME.github.io
```

6. Deploy and copy the backend URL, for example:

```text
https://YOUR-RENDER-SERVICE.onrender.com
```

Render Free may sleep after inactivity. The first request after sleep can take a while.

SQLite files on Render Free are not a long-term publishing store. For durable published newsletters, connect a persistent database or republish after redeploys.

## Configure Frontend API Base

Edit `frontend/config.js` and replace:

```javascript
https://YOUR-RENDER-SERVICE.onrender.com
```

with your real Render backend URL.

For GitHub Pages, keep:

```javascript
publicMode: window.location.hostname.endsWith('github.io')
```

so public users see only published newsletters.

## Deploy Frontend To GitHub Pages

GitHub Pages only hosts static frontend files. It does not run FastAPI.

Option A: publish `/frontend` as the Pages source if your repo settings support a custom folder.

Option B: copy the contents of `frontend/` to the Pages branch/root used by your repo:

```text
frontend/index.html
frontend/app.js
frontend/styles.css
frontend/config.js
frontend/src/*
```

Then enable GitHub Pages in the repository settings and open:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO/
```

If your Pages URL includes a repository path, no code change is needed because assets use relative paths.
