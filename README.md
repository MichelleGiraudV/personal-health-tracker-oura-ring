# Personal Health Tracker (Oura Ring)

This project connects your Oura account to your app, saves OAuth tokens, fetches health data, and stores it in PostgreSQL for future analytics and dashboards.

## What You Have Completed

### Phase 1: Infrastructure
- Node.js installed and working
- Next.js app running on `http://localhost:3000`
- Docker Desktop running
- PostgreSQL running in Docker
- Database tables created

### Phase 2: OAuth (Connect Oura)
- Implemented callback route: `GET /api/auth/oura/callback`
- Exchanged OAuth `code` for `access_token` and `refresh_token`
- Saved tokens in `oura_token` table

### Phase 3: Data Sync
- Implemented sync service in `apps/web/src/lib/oura.ts`
- Added sync API route: `GET /api/oura/sync`
- Fetched Oura data from:
  - `daily_sleep`
  - `daily_activity`
  - `daily_readiness`
- Saved raw data to `oura_raw_daily`
- Upserted clean metrics to `daily_summary`
- Added token auto-refresh on `401` and retry logic
- Triggered initial sync automatically after OAuth callback

## Current Working Flow

1. User logs into Oura and approves access.
2. Oura redirects to `/api/auth/oura/callback?code=...`
3. App exchanges code for tokens and saves them.
4. App runs initial 30-day sync.
5. App can run manual sync with `/api/oura/sync?days=7` (or any `1-365`).

## Main Endpoints

- `GET /api/auth/oura/callback`
  - Handles OAuth callback, saves tokens, triggers initial sync.
- `GET /api/oura/sync`
  - Runs sync for latest connected user (default 30 days).
- `GET /api/oura/sync?days=7`
  - Runs sync for last 7 days.
- `GET /api/oura/sync?userId=<uuid>&days=30`
  - Runs sync for a specific user.

## Environment Variables (`apps/web/.env.local`)

```env
OURA_CLIENT_ID=your_client_id
OURA_CLIENT_SECRET=your_client_secret
OURA_REDIRECT_URI=http://localhost:3000/api/auth/oura/callback
DATABASE_URL=postgresql://app:app@localhost:5433/oura
```

## Run Locally

1. Start database:
```bash
docker compose up -d db
```

2. Start web app:
```bash
cd apps/web
npm run dev
```

3. Connect Oura (authorize URL in browser), then test:
```text
http://localhost:3000/api/oura/sync?days=7
```

## Notes

- Docker Postgres is mapped to host port `5433` to avoid conflict with local Postgres.
- If `/api/oura/sync` fails, check the JSON error body and server logs first.

## Next Step

Build a dashboard page that reads from `daily_summary` and displays latest sleep, activity, and readiness scores.
