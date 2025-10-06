"use server";

import { revalidatePath } from "next/cache";

import { requiredServerEnv } from "@/lib/env";
import { getSupabaseAdmin, type CandidateRootUpdate } from "@/lib/supabase";

const ALLOWED_STATUSES = new Set(["pending", "approved", "rejected"]);

export async function updateCandidateStatus(formData: FormData) {
  requiredServerEnv();

  const id = formData.get("id");
  const status = formData.get("status");

  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("Invalid candidate id");
  }

  if (typeof status !== "string" || !ALLOWED_STATUSES.has(status)) {
    throw new Error("Invalid status");
  }

  const client = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const payload: CandidateRootUpdate = {
    status,
    updated_at: nowIso,
  };

  if (status === "approved") {
    payload.llm_label = "manual";
    payload.llm_score = 0.9;
    payload.rejection_reason = null;
  } else if (status === "rejected") {
    payload.rejection_reason = "manual";
  } else {
    payload.rejection_reason = null;
  }

  await client
    .from("ai_trends_candidate_roots")
    // @ts-ignore Supabase typings expect an array payload; single object works at runtime
    .update(payload as CandidateRootUpdate)
    .eq("id", id);

  revalidatePath("/candidates");
}

export async function refreshCandidateStatuses() {
  requiredServerEnv();
  revalidatePath("/candidates");
}
