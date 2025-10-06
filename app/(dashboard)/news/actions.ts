"use server";

import { harvestSignals } from "@/lib/signals/ingest";
import { requiredServerEnv } from "@/lib/env";

export async function triggerNewsIngest() {
  requiredServerEnv();
  const summary = await harvestSignals();
  return summary;
}
