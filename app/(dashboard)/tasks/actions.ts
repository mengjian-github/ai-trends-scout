"use server";

import { headers } from "next/headers";

import { queueRootTasks } from "@/lib/services/trends-ingest";
import { env, requiredServerEnv } from "@/lib/env";

const isLocalHost = (host: string | null | undefined) => {
  if (!host) {
    return true;
  }

  return /^(localhost|127\.0\.0\.1)(:\\d+)?$/i.test(host.trim());
};

const resolveOrigin = async () => {
  const headerList = await headers();
  const forwardedProto = headerList.get("x-forwarded-proto");
  const forwardedHost = headerList.get("x-forwarded-host") ?? headerList.get("host");

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

  return "http://localhost:3000";
};

export async function triggerTrendsRun() {
  requiredServerEnv();

  const origin = await resolveOrigin();
  const callbackUrl = `${origin}/api/dataforseo/callback`;

  const result = await queueRootTasks({ callbackUrl });
  return result;
}
