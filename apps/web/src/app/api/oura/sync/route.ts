import { NextResponse } from "next/server";
import { getLatestToken, syncOuraForUser } from "@/lib/oura";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const daysParam = Number(searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 7;

  const token = await getLatestToken();

  if (!token?.user_id) {
    return NextResponse.json(
      { error: "No Oura user token found. Complete OAuth first." },
      { status: 400 }
    );
  }

  const result = await syncOuraForUser(token.user_id, days);
  return NextResponse.json({ success: true, ...result });
}
