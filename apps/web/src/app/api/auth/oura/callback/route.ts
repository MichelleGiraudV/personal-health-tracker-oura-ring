import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { syncOuraForUser } from "@/lib/oura";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Missing OAuth code" },
      { status: 400 }
    );
  }

  const clientId = process.env.OURA_CLIENT_ID!;
  const clientSecret = process.env.OURA_CLIENT_SECRET!;
  const redirectUri = process.env.OURA_REDIRECT_URI!;

  const basicAuth = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const tokenRes = await fetch("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson = await tokenRes.json();

  if (!tokenRes.ok) {
    return NextResponse.json(tokenJson, { status: 500 });
  }

  // --- SAVE TOKENS ---

  const userRes = await query<{ id: string }>(
    "insert into app_user default values returning id"
  );
  const userId = userRes.rows[0].id;

  const expiresIn = Number(tokenJson.expires_in ?? 0);
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await query(
    `insert into oura_token (user_id, access_token, refresh_token, expires_at)
     values ($1, $2, $3, $4)
     on conflict (user_id)
     do update set access_token = excluded.access_token,
                   refresh_token = excluded.refresh_token,
                   expires_at = excluded.expires_at,
                   updated_at = now()`,
    [
      userId,
      tokenJson.access_token,
      tokenJson.refresh_token,
      expiresAt,
    ]
  );

  let initialSync = null;
  let initialSyncError = null;

  try {
    initialSync = await syncOuraForUser(userId, 30);
  } catch (error) {
    initialSyncError =
      error instanceof Error ? error.message : "Initial sync failed";
  }

  return NextResponse.json({
    success: true,
    userId,
    initialSync,
    initialSyncError,
  });
}
