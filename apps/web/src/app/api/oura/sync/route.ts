import { NextResponse } from "next/server";
import { getLatestToken, syncOuraForUser } from "@/lib/oura";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const daysParam = searchParams.get("days");
    const days = daysParam ? Number(daysParam) : 30;

    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: "days must be a number between 1 and 365" },
        { status: 400 }
      );
    }

    let targetUserId = userId;
    if (!targetUserId) {
      const latest = await getLatestToken();
      if (!latest) {
        return NextResponse.json(
          { error: "No connected Oura user found yet. Connect Oura first." },
          { status: 404 }
        );
      }
      targetUserId = latest.user_id;
    }

    const result = await syncOuraForUser(targetUserId, days);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected sync error",
      },
      { status: 500 }
    );
  }
}
