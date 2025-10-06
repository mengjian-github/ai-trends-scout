import {
  candidateLlmBatchSize,
  candidateMaxPerSource,
  candidateMaxTotal,
  candidateTtlHours,
  openRouterApiKey,
  openRouterModel,
} from "@/lib/env";
import { getSupabaseAdmin, type CandidateRootInsert, type CandidateRootRow } from "@/lib/supabase";
import type { Json } from "@/types/supabase";

export type RawCandidateEntry = {
  term: string;
  source?: string;
  title?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  url?: string | null;
  capturedAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RecordCandidateStats = {
  attempted: number;
  accepted: number;
  deduped: number;
  upserted: number;
  sources: Record<string, number>;
};

export type CandidateEvaluationStats = {
  enabled: boolean;
  processed: number;
  approved: number;
  rejected: number;
  pending: number;
  errors: number;
};

export type CandidateSeed = {
  id: string;
  term: string;
  source: string;
  label: string | null;
  score: number | null;
  capturedAt: string;
  expiresAt: string;
  url: string | null;
};

const DEFAULT_TTL_HOURS = candidateTtlHours > 0 ? candidateTtlHours : 72;
const MAX_LLM_ATTEMPTS = 3;
const LLM_BATCH = candidateLlmBatchSize > 0 ? candidateLlmBatchSize : 8;
const MAX_TOTAL_CANDIDATES = candidateMaxTotal > 0 ? candidateMaxTotal : 120;
const MAX_PER_SOURCE = candidateMaxPerSource > 0 ? candidateMaxPerSource : 40;

const STOP_TERMS = new Set([
  "ai",
  "人工智能",
  "machine learning",
  "artificial intelligence",
  "technology",
  "tech",
  "startup",
  "news",
  "best",
  "top",
  "latest",
  "daily",
  "update",
  "guide",
  "tutorial",
  "template",
  "example",
  "sample",
  "free",
]);

const normalizeTerm = (value: string) => value.trim();

const normalizeKey = (value: string) => normalizeTerm(value).toLowerCase();

const looksLikeCandidateTerm = (value: string) => {
  const term = normalizeTerm(value);
  if (term.length < 3 || term.length > 80) {
    return false;
  }

  if (STOP_TERMS.has(term.toLowerCase())) {
    return false;
  }

  if (!/[a-zA-Z0-9]/.test(term)) {
    return false;
  }

  if (/^https?:\/\//i.test(term)) {
    return false;
  }

  return true;
};

const sanitizeTags = (tags: string[] | null | undefined) => {
  if (!Array.isArray(tags) || tags.length === 0) {
    return null;
  }

  const sanitized = tags
    .map((tag) => normalizeTerm(tag))
    .filter((tag) => tag.length > 0 && tag.length <= 80)
    .slice(0, 10);

  return sanitized.length > 0 ? sanitized : null;
};

const toJson = (value: Record<string, unknown> | null | undefined): Json => {
  if (!value) {
    return {} as Json;
  }

  const entries = Object.entries(value).filter(([, val]) => val !== undefined);
  const record: Record<string, Json> = {};
  for (const [key, val] of entries) {
    record[key] = val as Json;
  }
  return record as Json;
};

const computeExpiresAt = (captured: Date) => {
  const ttlMs = DEFAULT_TTL_HOURS * 60 * 60 * 1000;
  return new Date(captured.getTime() + ttlMs);
};

export const recordCandidateRoots = async (entries: RawCandidateEntry[]): Promise<RecordCandidateStats> => {
  const stats: RecordCandidateStats = {
    attempted: entries.length,
    accepted: 0,
    deduped: 0,
    upserted: 0,
    sources: {},
  };

  if (entries.length === 0) {
    return stats;
  }

  const seen = new Set<string>();
  const sourceCounts: Record<string, number> = {};
  let totalAccepted = 0;
  const payloads: CandidateRootInsert[] = [];
  const nowIso = new Date().toISOString();

  for (const entry of entries) {
    const term = normalizeTerm(entry.term ?? "");
    if (!term || !looksLikeCandidateTerm(term)) {
      continue;
    }

    const source = (entry.source ?? "").trim().toLowerCase();
    if (!source) {
      continue;
    }

    const key = `${normalizeKey(term)}::${source}`;
    if (seen.has(key)) {
      stats.deduped += 1;
      continue;
    }

    if (totalAccepted >= MAX_TOTAL_CANDIDATES) {
      stats.deduped += 1;
      continue;
    }

    if ((sourceCounts[source] ?? 0) >= MAX_PER_SOURCE) {
      stats.deduped += 1;
      continue;
    }

    seen.add(key);
    stats.accepted += 1;
    stats.sources[source] = (stats.sources[source] ?? 0) + 1;
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
    totalAccepted += 1;

    const capturedAt = entry.capturedAt ? new Date(entry.capturedAt) : new Date();
    const capturedIso = Number.isNaN(capturedAt.getTime()) ? nowIso : capturedAt.toISOString();
    const expiresIso = computeExpiresAt(new Date(capturedIso)).toISOString();

    payloads.push({
      term,
      term_normalized: normalizeKey(term),
      source,
      status: "pending",
      raw_title: entry.title ?? null,
      raw_summary: entry.summary ?? null,
      raw_tags: sanitizeTags(entry.tags),
      url: entry.url ?? null,
      captured_at: capturedIso,
      expires_at: expiresIso,
      metadata: toJson(entry.metadata ?? {}),
      updated_at: nowIso,
    });
  }

  if (payloads.length === 0) {
    return stats;
  }

  try {
    const client = getSupabaseAdmin();
    const { data, error } = await client
      .from("ai_trends_candidate_roots")
      .upsert(payloads as any, { onConflict: "term_normalized,source" })
      .select("id");

    if (error) {
      throw error;
    }

    stats.upserted = data?.length ?? 0;
  } catch (error) {
    console.error("Failed to upsert candidate roots", error);
  }

  return stats;
};

const buildLlmPrompt = (candidate: CandidateRootRow) => {
  const parts: string[] = [];
  parts.push(`Term: ${candidate.term}`);
  parts.push(`Source: ${candidate.source}`);
  if (candidate.raw_title) {
    parts.push(`Title: ${candidate.raw_title}`);
  }
  if (candidate.raw_summary) {
    parts.push(`Summary: ${candidate.raw_summary}`);
  }
  if (candidate.raw_tags && candidate.raw_tags.length > 0) {
    parts.push(`Tags: ${candidate.raw_tags.join(", ")}`);
  }
  if (candidate.url) {
    parts.push(`URL: ${candidate.url}`);
  }

  parts.push(
    "Task: Decide whether the term represents a newly emerging software tool, automation, digital product, or online service that people might search for to accomplish a task. Accept AI-related or non-AI tools as long as a web-based or software solution could address the underlying need."
  );
  parts.push(
    "If it is primarily entertainment, general news, personalities, funding rounds, conferences, hardware devices without a software offering, or vague hype with no actionable user demand, classify it as non_tool."
  );
  parts.push(
    "Return strict JSON: {\"label\": \"tool|non_tool|unclear\", \"score\": number 0-1, \"reason\": string }." 
  );

  return parts.join("\n");
};

const callCandidateJudge = async (candidate: CandidateRootRow) => {
  if (!openRouterApiKey) {
    throw new Error("OpenRouter API key is not configured");
  }

  const body = {
    model: openRouterModel ?? "anthropic/claude-3-haiku",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an analyst helping classify whether a term refers to a newly emerging software tool, automation, or digital service that people might search for to solve a task. Respond with strict JSON only.",
      },
      {
        role: "user",
        content: buildLlmPrompt(candidate),
      },
    ],
  };

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ai-trends-scout",
      "X-Title": "AI Trends Scout",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} - ${text}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenRouter response missing content");
  }

  try {
    const parsed = JSON.parse(content) as { label?: string; score?: number; reason?: string };
    const label = typeof parsed.label === "string" ? parsed.label.toLowerCase() : "unclear";
    const score = typeof parsed.score === "number" && Number.isFinite(parsed.score) ? parsed.score : null;
    const reason = typeof parsed.reason === "string" ? parsed.reason : null;
    return { label, score, reason } as const;
  } catch (error) {
    console.error("Failed to parse OpenRouter response", { content });
    throw error;
  }
};

export const evaluatePendingCandidates = async (
  limit = LLM_BATCH
): Promise<CandidateEvaluationStats> => {
  if (!openRouterApiKey) {
    return { enabled: false, processed: 0, approved: 0, rejected: 0, pending: 0, errors: 0 };
  }

  const client = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("ai_trends_candidate_roots")
    .select(
      "id, term, source, raw_title, raw_summary, raw_tags, url, metadata, captured_at, expires_at, llm_attempts"
    )
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .lt("llm_attempts", MAX_LLM_ATTEMPTS)
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch pending candidates for LLM", error);
    return { enabled: true, processed: 0, approved: 0, rejected: 0, pending: 0, errors: 1 };
  }

  const candidates = (data ?? []) as CandidateRootRow[];
  if (candidates.length === 0) {
    return { enabled: true, processed: 0, approved: 0, rejected: 0, pending: 0, errors: 0 };
  }

  let approved = 0;
  let rejected = 0;
  let pending = 0;
  let errorsCount = 0;

  for (const candidate of candidates) {
    const now = new Date().toISOString();
    let label: string | null = null;
    let score: number | null = null;
    let reason: string | null = null;
    let statusUpdate = "pending";

    try {
      const result = await callCandidateJudge(candidate as CandidateRootRow);
      label = result.label ?? null;
      score = typeof result.score === "number" ? result.score : null;
      reason = result.reason ?? null;

      if (label === "ai_tool" || label === "tool") {
        statusUpdate = "approved";
        approved += 1;
      } else if (label === "non_ai" || label === "non_tool") {
        statusUpdate = "rejected";
        rejected += 1;
      } else {
        statusUpdate = "pending";
        pending += 1;
      }
    } catch (error) {
      errorsCount += 1;
      reason = `llm_error: ${(error as Error).message}`;
      if ((candidate.llm_attempts ?? 0) + 1 >= MAX_LLM_ATTEMPTS) {
        statusUpdate = "rejected";
        rejected += 1;
      } else {
        statusUpdate = "pending";
        pending += 1;
      }
    }

    try {
      const candidateTable = client.from("ai_trends_candidate_roots") as any;
      await candidateTable
        .update({
          status: statusUpdate,
          llm_label: label,
          llm_score: score,
          llm_reason: reason,
          llm_attempts: (candidate.llm_attempts ?? 0) + 1,
          llm_last_attempt: now,
          rejection_reason: statusUpdate === "rejected" ? reason : null,
          updated_at: now,
        })
        .eq("id", candidate.id);
    } catch (error) {
      console.error("Failed to update candidate after LLM evaluation", {
        candidateId: candidate.id,
        error,
      });
    }
  }

  return {
    enabled: true,
    processed: candidates.length,
    approved,
    rejected,
    pending,
    errors: errorsCount,
  };
};

export const fetchApprovedCandidateRoots = async (params: {
  limit?: number;
  maxAgeHours?: number;
} = {}): Promise<CandidateSeed[]> => {
  const { limit = 20, maxAgeHours } = params;
  const client = getSupabaseAdmin();
  const now = new Date();
  const cutoffMs = maxAgeHours && maxAgeHours > 0 ? maxAgeHours * 60 * 60 * 1000 : DEFAULT_TTL_HOURS * 60 * 60 * 1000;
  const minCapturedIso = new Date(now.getTime() - cutoffMs).toISOString();
  const nowIso = now.toISOString();

  const { data, error } = await client
    .from("ai_trends_candidate_roots")
    .select("id, term, source, llm_label, llm_score, captured_at, expires_at, url")
    .eq("status", "approved")
    .is("queried_at", null)
    .gt("expires_at", nowIso)
    .gte("captured_at", minCapturedIso)
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch approved candidate roots", error);
    return [];
  }

  const rows = (data ?? []) as CandidateRootRow[];
  return rows.map((row) => ({
    id: row.id,
    term: row.term,
    source: row.source,
    label: row.llm_label ?? null,
    score: typeof row.llm_score === "number" ? row.llm_score : null,
    capturedAt: row.captured_at,
    expiresAt: row.expires_at,
    url: row.url ?? null,
  }));
};

export const markCandidatesQueued = async (ids: string[]): Promise<void> => {
  if (!ids || ids.length === 0) {
    return;
  }

  try {
    const client = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const table = client.from("ai_trends_candidate_roots") as any;
    await table.update({ status: "queued", queried_at: nowIso, updated_at: nowIso }).in("id", ids);
  } catch (error) {
    console.error("Failed to mark candidate roots as queued", error);
  }
};

export const expireStaleCandidates = async (): Promise<{ updated: number }> => {
  const nowIso = new Date().toISOString();
  const client = getSupabaseAdmin();
  const table = client.from("ai_trends_candidate_roots") as any;
  const { data, error } = await table
    .update({ status: "expired", updated_at: nowIso })
    .lt("expires_at", nowIso)
    .in("status", ["pending", "approved"])
    .select("id");

  if (error) {
    console.error("Failed to expire stale candidate roots", error);
    return { updated: 0 };
  }

  return { updated: data?.length ?? 0 };
};
