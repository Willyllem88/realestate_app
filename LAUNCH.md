# LAUNCH.md - run the project from zero (VS Code)

Stack: **Node.js + TypeScript (Express)**, **MySQL**, plain HTML/JS frontend (no build step), optional AI (Gemini API).
Everything runs on one port: the backend also serves the frontend.

## 0. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 18.17 or newer (20/22 recommended) | `node -v` |
| npm | comes with Node | `npm -v` |
| MySQL 8 **or** Docker Desktop | see step 2 | `mysql --version` / `docker -v` |
| VS Code | any | |

## 1. Open the project in VS Code

1. `File → Open Folder…` and choose the project folder (the one containing `package.json`).
2. Open the integrated terminal: `` Ctrl+` `` (Windows/Linux) or `` Cmd+` `` (macOS).
   All commands below are run in that terminal, from the project root.

## 2. Start MySQL (choose ONE option)

**Option A: Docker (easiest).** Uses the included `docker-compose.yml` (root password `rootpass`, port 3306):

```bash
docker compose up -d
```

Wait ~15 seconds for MySQL to finish starting (`docker compose logs -f mysql` shows "ready for connections").

**Option B: MySQL already installed locally.** Make sure the server is running and you know the `root` password
(or create a dedicated user). You do **not** need to create the database by hand; step 5 does it.

## 3. Install dependencies

```bash
npm install
```

## 4. Configure environment variables

Copy the template and edit it if needed:

```bash
# macOS / Linux / Git Bash
cp .env.example .env

# Windows PowerShell
copy .env.example .env
```

Open `.env` and check:

- `DB_USER` / `DB_PASSWORD`: with Docker (Option A) leave the defaults (`root` / `rootpass`).
  With a local MySQL (Option B) put **your** password.
- `GEMINI_API_KEY`: **optional**. Leave empty to run fully offline with rule-based extraction and search.
  Add a key to switch on AI extraction/summaries and AI query understanding.

## 5. Create the database and table

```bash
npm run db:init
```

Expected: `✔ Database "realestate" and table "listings" are ready.`

## 6. Load data (choose ONE)

**Option A: demo data, works offline, recommended first** (100 realistic, deliberately messy offers, 4 of them duplicates):

```bash
npm run seed
```

**Option B: crawl real offers from otodom.pl** (~100 offers; needs internet; takes a few minutes because it waits between requests):

```bash
npm run crawl
# options:  npm run crawl -- --limit=50     npm run crawl -- --no-ai
```

Expected output ends with something like:
`✔ Stored 100 (failed 0). Table now: 100 rows, 4 flagged duplicates, avg quality 72/100.`

## 7. Start the app

```bash
npm run dev
```

You should see: `✔ Server running at http://localhost:3000`.
Open **http://localhost:3000** (Ctrl+click the link in the terminal).

- **Search** tab: text search, city, m², price, rooms, amenities, sorting, pagination.
- **Describe what you want** tab: type a vague request, e.g. `I want a nice, cheap flat, 40m in Kraków`.
- Click any card to open the offer page.

`npm run dev` restarts automatically when you edit backend files. Frontend files in `public/` only need a browser refresh.

## 8. Debugging in VS Code (optional)

`Run and Debug` (Ctrl+Shift+D) → **Debug server** → F5. Breakpoints work in the `.ts` files.
(Stop `npm run dev` first so the port is free.)

## Useful commands

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript check without running |
| `npm run seed` | (Re)load demo data; safe to run again (upsert by source + id) |
| `npm run crawl` | Fetch real offers |
| `curl localhost:3000/api/health` | Server + DB health, and whether AI is on |
| `docker compose down -v` | Stop MySQL and delete its data (start fresh) |
