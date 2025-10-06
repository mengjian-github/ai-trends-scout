"use server";

import { ingestNewsFeeds } from "@/lib/news/ingest";
import { requiredServerEnv } from "@/lib/env";

export async function triggerNewsIngest() {
  requiredServerEnv();
  const stats = await ingestNewsFeeds();
  return stats;
}

