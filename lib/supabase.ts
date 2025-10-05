import "@/lib/server-proxy";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { env } from "./env";

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

export const getLatestKeywords = async (params: {
  timeframe?: string;
  limit?: number;
  minRatio?: number;
}) => {
  const client = getSupabaseAdmin();
  const { timeframe, limit = 50, minRatio } = params;

  let query = client
    .from("ai_trends_keywords")
    .select("*")
    .order("latest_ratio", { ascending: false })
    .limit(limit);

  if (timeframe) {
    query = query.eq("timeframe", timeframe);
  }

  if (typeof minRatio === "number") {
    query = query.gte("latest_ratio", minRatio);
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
    .from<TrendRootRow>("ai_trends_roots")
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
    .from<TrendRootRow>("ai_trends_roots")
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
    .from<TrendRunRow>("ai_trends_runs")
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
    .from<TrendRunRow>("ai_trends_runs")
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
    .from<TrendRunRow>("ai_trends_runs")
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
    .from<TrendsTaskRow>("ai_trends_tasks")
    .select("status")
    .eq("run_id", runId);

  if (error) {
    throw error;
  }

  const rows = data ?? [];
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
    .from<TrendRunRow>("ai_trends_runs")
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
    .from<TrendsTaskRow>("ai_trends_tasks")
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
    .from<TrendsTaskRow>("ai_trends_tasks")
    .select("cost")
    .eq("run_id", runId);

  if (error) {
    throw error;
  }

  const rows = data ?? [];
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
  const { data, error } = await client.from("ai_trends_tasks").insert(records).select("*");

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const updateTrendTask = async (taskId: string, updates: TrendsTaskUpdate) => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_tasks")
    .update(updates)
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
  const payload = {
    is_brand: false,
    demand_category: null,
    summary: record.summary ?? null,
    news_refs: record.news_refs ?? null,
    metadata: record.metadata ?? {},
    coverage_countries: record.coverage_countries ?? null,
    ...record,
    updated_at: new Date().toISOString(),
    first_seen: record.first_seen ?? new Date().toISOString(),
    last_seen: record.last_seen ?? new Date().toISOString(),
  } satisfies Database["public"]["Tables"]["ai_trends_keywords"]["Insert"];

  const { data, error } = await client
    .from("ai_trends_keywords")
    .upsert(payload, { onConflict: "keyword,locale,timeframe" })
    .select("*")
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
  const { data, error } = await client.from("ai_trends_snapshots").insert(record).select("*").maybeSingle();

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
  const { data, error } = await client
    .from<Database["public"]["Tables"]["ai_trends_events"]["Row"]>("ai_trends_events")
    .insert({ event_type: eventType, payload } as Database["public"]["Tables"]["ai_trends_events"]["Insert"])
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
};
