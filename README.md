# Personal health tracker oura ring

A full-stack personalized health tracking application that integrates wearable data (Oura Ring), user-logged meals and workouts, and data analysis to generate health insights and recommendations. Built with Next.js, TypeScript, PostgreSQL, and Python.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (running)

## First-time setup

1. Install web dependencies:

```powershell
npm --prefix apps/web install
```

2. Confirm env file exists at `apps/web/.env.local` and includes:

```env
DATABASE_URL=postgresql://app:app@localhost:5433/oura
OURA_CLIENT_ID=...
OURA_CLIENT_SECRET=...
OURA_REDIRECT_URI=http://localhost:3000/api/auth/oura/callback
```

## Start everything

From repository root:

```powershell
npm run dev
```

This does both:

1. Starts PostgreSQL in Docker (`db`) on `localhost:5433`.
2. Starts the Next.js app in `apps/web`.

Open the app at:

- `http://localhost:3000`
- If 3000 is busy, use the fallback URL shown in terminal (example: `http://localhost:3001`).

## Useful commands

```powershell
npm run db:up
npm run db:down
npm run db:logs
npm run web:dev
npm run web:build
```

## OAuth + sync flow

After app is running:

1. Start OAuth login in browser (replace `YOUR_CLIENT_ID`):

```text
https://cloud.ouraring.com/oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/api/auth/oura/callback&scope=daily%20heartrate
```

2. Run a sync:

```text
http://localhost:3000/api/oura/sync?days=7
```

## Troubleshooting

- `Port 3000 is in use`: stop old Node process, then rerun `npm run dev`.
- `Unable to acquire lock ... .next/dev/lock`: another `next dev` is already running in `apps/web`; stop it and restart.
- DB connection errors: run `npm run db:logs` and verify `DATABASE_URL` uses port `5433`.

## The architecture to retrieve the data
Oura API
   ↓
fetchWithAutoRefresh()
   ↓
saveRawDailyData()
   ↓
saveDailySummary()
   ↓
daily_summary table