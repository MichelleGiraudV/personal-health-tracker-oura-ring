import { query } from "@/lib/db";

const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const OURA_V2_BASE_URL = "https://api.ouraring.com/v2/usercollection";

type OuraTokenRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
};

type OuraDailySource = "daily_sleep" | "daily_activity" | "daily_readiness";

type DailySummaryAccumulator = {
  sleep_total_seconds?: number | null;
  sleep_efficiency?: number | null;
  sleep_latency_seconds?: number | null;
  readiness_score?: number | null;
  steps?: number | null;
  activity_score?: number | null;
};

function getBasicAuthHeader() {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing OURA_CLIENT_ID or OURA_CLIENT_SECRET");
  }

  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export async function getLatestToken(): Promise<OuraTokenRow | null> {
  const res = await query<OuraTokenRow>(
    `select user_id, access_token, refresh_token, expires_at
     from oura_token
     order by updated_at desc
     limit 1`
  );
  return res.rows[0] ?? null;
}

export async function getTokenByUserId(userId: string): Promise<OuraTokenRow | null> {
  const res = await query<OuraTokenRow>(
    `select user_id, access_token, refresh_token, expires_at
     from oura_token
     where user_id = $1
     limit 1`,
    [userId]
  );
  return res.rows[0] ?? null;
}

async function refreshAccessToken(
  userId: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenRes = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: getBasicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const tokenJson = await tokenRes.json();

  if (!tokenRes.ok) {
    throw new Error(`Failed to refresh token: ${JSON.stringify(tokenJson)}`);
  }

  const expiresIn = Number(tokenJson.expires_in ?? 0);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await query(
    `update oura_token
     set access_token = $2,
         refresh_token = $3,
         expires_at = $4,
         updated_at = now()
     where user_id = $1`,
    [userId, tokenJson.access_token, tokenJson.refresh_token, expiresAt]
  );

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token,
  };
}

async function fetchWithAutoRefresh(
  userId: string,
  accessToken: string,
  refreshToken: string,
  endpoint: string,
  startDate: string,
  endDate: string
) {
  const url = `${OURA_V2_BASE_URL}/${endpoint}?start_date=${startDate}&end_date=${endDate}`;

  let res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;

  if (res.status === 401) {
    const refreshed = await refreshAccessToken(userId, refreshToken);
    currentAccessToken = refreshed.accessToken;
    currentRefreshToken = refreshed.refreshToken;
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${currentAccessToken}`,
      },
    });
  }

  const payload = await res.json();

  if (!res.ok) {
    throw new Error(`Oura API error for ${endpoint}: ${JSON.stringify(payload)}`);
  }

  return {
    payload,
    accessToken: currentAccessToken,
    refreshToken: currentRefreshToken,
  };
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

async function saveRawDailyData(
  userId: string,
  source: OuraDailySource,
  payload: Record<string, unknown>
) {
  const data = Array.isArray(payload.data) ? payload.data : [];

  for (const row of data) {
    const day = typeof row?.day === "string" ? row.day : null;
    if (!day) {
      continue;
    }

    await query(
      `insert into oura_raw_daily (user_id, day, source, payload)
       values ($1, $2, $3, $4::jsonb)
       on conflict (user_id, day, source)
       do update set payload = excluded.payload,
                     fetched_at = now()`,
      [userId, day, source, JSON.stringify(row)]
    );
  }
}

function buildSummaryPatch(source: OuraDailySource, row: Record<string, unknown>): DailySummaryAccumulator {
  if (source === "daily_sleep") {
    return {
      sleep_total_seconds: normalizeNumber(row.total_sleep_duration),
      sleep_efficiency: normalizeNumber(row.efficiency),
      sleep_latency_seconds: normalizeNumber(row.latency),
    };
  }

  if (source === "daily_readiness") {
    return {
      readiness_score: normalizeNumber(row.score),
    };
  }

  return {
    steps: normalizeNumber(row.steps),
    activity_score: normalizeNumber(row.score),
  };
}

async function saveDailySummary(userId: string, source: OuraDailySource, payload: Record<string, unknown>) {
  const data = Array.isArray(payload.data) ? payload.data : [];

  for (const row of data) {
    const day = typeof row?.day === "string" ? row.day : null;
    if (!day) {
      continue;
    }

    const patch = buildSummaryPatch(source, row as Record<string, unknown>);

    await query(
      `insert into daily_summary (
         user_id,
         day,
         sleep_total_seconds,
         sleep_efficiency,
         sleep_latency_seconds,
         readiness_score,
         steps,
         activity_score,
         updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (user_id, day)
       do update set
         sleep_total_seconds = coalesce(excluded.sleep_total_seconds, daily_summary.sleep_total_seconds),
         sleep_efficiency = coalesce(excluded.sleep_efficiency, daily_summary.sleep_efficiency),
         sleep_latency_seconds = coalesce(excluded.sleep_latency_seconds, daily_summary.sleep_latency_seconds),
         readiness_score = coalesce(excluded.readiness_score, daily_summary.readiness_score),
         steps = coalesce(excluded.steps, daily_summary.steps),
         activity_score = coalesce(excluded.activity_score, daily_summary.activity_score),
         updated_at = now()`,
      [
        userId,
        day,
        patch.sleep_total_seconds ?? null,
        patch.sleep_efficiency ?? null,
        patch.sleep_latency_seconds ?? null,
        patch.readiness_score ?? null,
        patch.steps ?? null,
        patch.activity_score ?? null,
      ]
    );
  }
}

export async function syncOuraForUser(userId: string, days = 30) {
  const token = await getTokenByUserId(userId);
  if (!token) {
    throw new Error("No Oura token found for this user");
  }

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - days);

  const start = toISODate(startDate);
  const end = toISODate(endDate);

  const sources: Array<{ endpoint: OuraDailySource; source: OuraDailySource }> = [
    { endpoint: "daily_sleep", source: "daily_sleep" },
    { endpoint: "daily_activity", source: "daily_activity" },
    { endpoint: "daily_readiness", source: "daily_readiness" },
  ];

  const summary: Record<string, number> = {};

  let currentAccessToken = token.access_token;
  let currentRefreshToken = token.refresh_token;

  for (const item of sources) {
    const result = await fetchWithAutoRefresh(
      userId,
      currentAccessToken,
      currentRefreshToken,
      item.endpoint,
      start,
      end
    );
    const payload = result.payload;
    currentAccessToken = result.accessToken;
    currentRefreshToken = result.refreshToken;

    await saveRawDailyData(userId, item.source, payload);
    await saveDailySummary(userId, item.source, payload);

    const count = Array.isArray(payload.data) ? payload.data.length : 0;
    summary[item.source] = count;
  }

  return {
    userId,
    range: { start, end },
    counts: summary,
  };
}
