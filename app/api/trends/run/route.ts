import { NextRequest, NextResponse } from "next/server";

import { env, requiredServerEnv } from "@/lib/env";
import { queueRootTasks } from "@/lib/services/trends-ingest";

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

const isLocalHost = (host: string | null | undefined) => {
  if (!host) {
    return true;
  }

  return /^(localhost|127\.0\.0\.1)(:\\d+)?$/i.test(host.trim());
};

const resolveOrigin = (request: NextRequest) => {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (forwardedHost && !isLocalHost(forwardedHost)) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  if (env.NEXT_PUBLIC_APP_URL) {
    return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (forwardedHost) {
    const proto = forwardedProto ?? "http";
    return `${proto}://${forwardedHost}`;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
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

  const origin = resolveOrigin(request);
  const callbackUrl = `${origin}/api/dataforseo/callback`;

  try {
    const result = await queueRootTasks({ callbackUrl });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to queue root tasks", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
