import { NextRequest, NextResponse } from "next/server";

import { env, requiredServerEnv } from "@/lib/env";
import { harvestSignals } from "@/lib/signals/ingest";

export const runtime = "nodejs";
export const maxDuration = 120;

const isAuthorized = (request: NextRequest) => {
  if (!env.AI_TRENDS_SYNC_TOKEN) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return false;
  }

  const expected = `Bearer ${env.AI_TRENDS_SYNC_TOKEN}`;
  return authHeader === expected;
};

export async function POST(request: NextRequest) {
  try {
    requiredServerEnv();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await harvestSignals();
    return NextResponse.json({
      status: "ok",
      inserted: summary.news.inserted,
      updated: summary.news.updated,
      skipped: summary.news.skipped,
      summary,
    });
  } catch (error) {
    console.error("Failed to ingest AI news", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
