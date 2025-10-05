import "@/lib/server-proxy";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import { env } from "./env";
import { NEW_KEYWORD_MAX_AGE_MS } from "@/lib/trends/constants";

type SupabaseAdminClient = SupabaseClient<Database>;

let adminClient: SupabaseAdminClient | undefined;

export const getSupabaseAdmin = (): SupabaseAdminClient => {
  if (!adminClient) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase admin credentials are not configured");
    }

    adminClient = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
      },
    });
  }

  return adminClient;
};

export type TrendKeywordRow = Database["public"]["Tables"]["ai_trends_keywords"]["Row"];
export type TrendSnapshotRow = Database["public"]["Tables"]["ai_trends_snapshots"]["Row"];
export type TrendRootRow = Database["public"]["Tables"]["ai_trends_roots"]["Row"];
export type TrendRootInsert = Database["public"]["Tables"]["ai_trends_roots"]["Insert"];
export type TrendRootUpdate = Database["public"]["Tables"]["ai_trends_roots"]["Update"];
export type TrendRunRow = Database["public"]["Tables"]["ai_trends_runs"]["Row"];
export type TrendRunInsert = Database["public"]["Tables"]["ai_trends_runs"]["Insert"];
export type TrendRunUpdate = Database["public"]["Tables"]["ai_trends_runs"]["Update"];

export const getLatestKeywords = async (params: { timeframe?: string; limit?: number }) => {
  const client = getSupabaseAdmin();
  const { timeframe, limit = 50 } = params;
  const recentThresholdIso = new Date(Date.now() - NEW_KEYWORD_MAX_AGE_MS).toISOString();

  let query = client
    .from("ai_trends_keywords")
    .select("*")
    .gte("first_seen", recentThresholdIso)
    .order("priority", { ascending: true })
    .order("spike_score", { ascending: false })
    .order("first_seen", { ascending: false })
    .limit(limit);

  if (timeframe) {
    query = query.eq("timeframe", timeframe);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const getKeywordSnapshots = async (keywordId: string, limit = 30) => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_snapshots")
    .select("*")
    .eq("keyword_id", keywordId)
    .order("collected_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const getActiveRoots = async () => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_roots")
    .select("*")
    .eq("is_active", true)
    .order("label", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const getAllRoots = async (): Promise<TrendRootRow[]> => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_roots")
    .select("*")
    .order("created_at", { ascending: false })
    .order("label", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const createRoot = async (record: TrendRootInsert): Promise<TrendRootRow> => {
  const client = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload: TrendRootInsert = {
    label: record.label.trim(),
    keyword: record.keyword.trim(),
    locale: (record.locale ?? "global").trim(),
    is_active: record.is_active ?? true,
    updated_at: now,
  };

  const { data, error } = await client
    .from("ai_trends_roots")
    // @ts-ignore Supabase typings expect an array payload; single object works at runtime
    .insert(payload as TrendRootInsert)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const updateRootById = async (id: string, updates: TrendRootUpdate): Promise<TrendRootRow | null> => {
  const client = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload: TrendRootUpdate = {
    ...updates,
    updated_at: now,
  };

  if (typeof payload.label === "string") {
    payload.label = payload.label.trim();
  }

  if (typeof payload.keyword === "string") {
    payload.keyword = payload.keyword.trim();
  }

  if (typeof payload.locale === "string") {
    payload.locale = payload.locale.trim();
  }

  const { data, error } = await client
    .from("ai_trends_roots")
    // @ts-ignore Supabase typings expect an array payload; single object works at runtime
    .update(payload as TrendRootUpdate)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const deleteRootById = async (id: string): Promise<void> => {
  const client = getSupabaseAdmin();
  const { error } = await client
    .from("ai_trends_roots")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
};

export const createTrendRun = async (record: TrendRunInsert): Promise<TrendRunRow> => {
  const client = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const payload: TrendRunInsert = {
    status: record.status ?? "queued",
    trigger_source: record.trigger_source ?? null,
    root_keywords: record.root_keywords ?? [],
    metadata: (record.metadata as Json) ?? ({} as Json),
    triggered_at: record.triggered_at ?? nowIso,
    created_at: record.created_at ?? nowIso,
    updated_at: record.updated_at ?? nowIso,
  };

  const { data, error } = await client
    .from("ai_trends_runs")
    // @ts-ignore Supabase typings expect an array payload; single object works at runtime
    .insert(payload as TrendRunInsert)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const updateTrendRunById = async (id: string, updates: TrendRunUpdate): Promise<TrendRunRow | null> => {
  const client = getSupabaseAdmin();
  const payload: TrendRunUpdate = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("ai_trends_runs")
    // @ts-ignore Supabase typings expect an array payload; single object works at runtime
    .update(payload as TrendRunUpdate)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};

export const getTrendRunById = async (id: string): Promise<TrendRunRow | null> => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};

export const getRunTaskStatusCounts = async (
  runId: string
): Promise<{ total: number; completed: number; queued: number; error: number }> => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_tasks")
    .select("status")
    .eq("run_id", runId);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as TrendsTaskRow[];
  const counts = {
    total: rows.length,
    completed: 0,
    queued: 0,
    error: 0,
  };

  for (const row of rows) {
    if (!row?.status) {
      continue;
    }

    if (row.status === "completed") {
      counts.completed += 1;
    } else if (row.status === "error") {
      counts.error += 1;
    } else {
      counts.queued += 1;
    }
  }

  return counts;
};

export const listTrendRuns = async (limit = 20): Promise<TrendRunRow[]> => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_runs")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const getTasksByRunId = async (runId: string): Promise<TrendsTaskRow[]> => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_tasks")
    .select("*")
    .eq("run_id", runId)
    .order("posted_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const getRunTaskCostTotal = async (runId: string): Promise<number> => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_tasks")
    .select("cost")
    .eq("run_id", runId);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as TrendsTaskRow[];
  return rows.reduce((accumulator, row) => {
    const cost = typeof row?.cost === "number" ? Number(row.cost) : 0;
    return accumulator + (Number.isFinite(cost) ? cost : 0);
  }, 0);
};

export type TrendsTaskRow = Database["public"]["Tables"]["ai_trends_tasks"]["Row"];
export type TrendsTaskInsert = Database["public"]["Tables"]["ai_trends_tasks"]["Insert"];
export type TrendsTaskUpdate = Database["public"]["Tables"]["ai_trends_tasks"]["Update"];

const TASK_ACTIVE_STATUSES = ["pending", "processing"] as const;

type TaskKey = {
  keyword: string;
  locale: string;
  timeframe: string;
};

const buildTaskKey = (input: TaskKey) => `${input.keyword}::${input.locale}::${input.timeframe}`;

export const getActiveTaskMap = async (keys: TaskKey[]) => {
  if (keys.length === 0) {
    return new Map<string, TrendsTaskRow>();
  }

  const client = getSupabaseAdmin();
  const keywords = Array.from(new Set(keys.map((item) => item.keyword)));
  const locales = Array.from(new Set(keys.map((item) => item.locale)));
  const timeframes = Array.from(new Set(keys.map((item) => item.timeframe)));

  const { data, error } = await client
    .from("ai_trends_tasks")
    .select("*")
    .in("keyword", keywords)
    .in("locale", locales)
    .in("timeframe", timeframes)
    .in("status", TASK_ACTIVE_STATUSES as unknown as string[]);

  if (error) {
    throw error;
  }

  const map = new Map<string, TrendsTaskRow>();
  (data ?? []).forEach((row) => {
    map.set(buildTaskKey(row), row);
  });

  return map;
};

export const insertTrendTasks = async (records: TrendsTaskInsert[]) => {
  if (records.length === 0) {
    return [] as TrendsTaskRow[];
  }

  const client = getSupabaseAdmin();
  const payload = records as Database["public"]["Tables"]["ai_trends_tasks"]["Insert"][];
  const { data, error } = await (client.from("ai_trends_tasks") as any)
    .insert(payload as any)
    .select("*");

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const updateTrendTask = async (taskId: string, updates: TrendsTaskUpdate) => {
  const client = getSupabaseAdmin();
  const { data, error } = await (client.from("ai_trends_tasks") as any)
    .update(updates as any)
    .eq("task_id", taskId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};

export const getTrendTaskByTaskId = async (taskId: string) => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_tasks")
    .select("*")
    .eq("task_id", taskId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};

export const upsertTrendKeyword = async (
  record: Partial<TrendKeywordRow> & Pick<TrendKeywordRow, "keyword" | "locale" | "timeframe">
) => {
  const client = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const trimOrFallback = (value: string | undefined) => (typeof value === "string" ? value.trim() : undefined);

  const payload: Database["public"]["Tables"]["ai_trends_keywords"]["Insert"] = {
    keyword: trimOrFallback(record.keyword) ?? record.keyword,
    locale: trimOrFallback(record.locale) ?? record.locale,
    timeframe: trimOrFallback(record.timeframe) ?? record.timeframe,
    first_seen: record.first_seen ?? nowIso,
    last_seen: record.last_seen ?? nowIso,
    is_brand: record.is_brand ?? false,
    metadata: record.metadata ?? {},
    updated_at: record.updated_at ?? nowIso,
  };

  if (Object.prototype.hasOwnProperty.call(record, "demand_category")) {
    payload.demand_category = record.demand_category ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(record, "spike_score")) {
    payload.spike_score = record.spike_score ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(record, "priority")) {
    payload.priority = record.priority ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(record, "summary")) {
    payload.summary = record.summary ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(record, "news_refs")) {
    payload.news_refs = record.news_refs ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(record, "created_at")) {
    payload.created_at = record.created_at ?? nowIso;
  }

  const keywordsTable = client.from("ai_trends_keywords") as any;

  const attemptUpsert = async (onConflict: string) =>
    keywordsTable.upsert(payload as any, { onConflict }).select("*").maybeSingle();

  const attemptCaseInsensitiveMerge = async () => {
    const existing = await (client.from("ai_trends_keywords") as any)
      .select("*")
      .eq("locale", payload.locale)
      .eq("timeframe", payload.timeframe)
      .ilike("keyword", payload.keyword)
      .maybeSingle();

    if (existing.error) {
      return existing;
    }

    if (existing.data) {
      const updatePayload: Database["public"]["Tables"]["ai_trends_keywords"]["Update"] = {
        ...payload,
        first_seen: existing.data.first_seen,
        created_at: existing.data.created_at,
      };

      return (client.from("ai_trends_keywords") as any)
        .update(updatePayload as any)
        .eq("id", existing.data.id)
        .select("*")
        .maybeSingle();
    }

    return (client.from("ai_trends_keywords") as any)
      .insert(payload as any)
      .select("*")
      .maybeSingle();
  };

  const conflictTargets = ["keyword,locale,timeframe", "keyword,locale"];

  let response = await attemptUpsert(conflictTargets[0]);

  if (response.error && response.error.code === "42P10" && conflictTargets.length > 1) {
    for (let index = 1; index < conflictTargets.length; index += 1) {
      response = await attemptUpsert(conflictTargets[index]);
      if (!response.error || response.error.code !== "42P10") {
        break;
      }
    }
  }

  if (response.error && response.error.code === "42P10") {
    response = await attemptCaseInsensitiveMerge();
  }

  if (response.error) {
    throw response.error;
  }

  return response.data ?? null;
};

export const getTrendKeywordByKey = async (
  keyword: string,
  locale: string,
  timeframe: string
): Promise<TrendKeywordRow | null> => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_keywords")
    .select("*")
    .eq("keyword", keyword)
    .eq("locale", locale)
    .eq("timeframe", timeframe)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};

export const insertTrendSnapshot = async (
  record: Database["public"]["Tables"]["ai_trends_snapshots"]["Insert"]
) => {
  const client = getSupabaseAdmin();
  const { data, error } = await (client.from("ai_trends_snapshots") as any)
    .insert(record as any)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};

export const insertTrendEvent = async (
  eventType: string,
  payload: unknown
): Promise<Database["public"]["Tables"]["ai_trends_events"]["Row"] | null> => {
  const client = getSupabaseAdmin();
  const { data, error } = await (client.from("ai_trends_events") as any)
    .insert({ event_type: eventType, payload } as any)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};
