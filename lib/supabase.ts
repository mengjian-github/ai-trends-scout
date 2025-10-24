import "@/lib/server-proxy";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
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
export type NewsItemRow = Database["public"]["Tables"]["ai_trends_news"]["Row"];
export type CandidateRootRow = Database["public"]["Tables"]["ai_trends_candidate_roots"]["Row"];
export type CandidateRootInsert = Database["public"]["Tables"]["ai_trends_candidate_roots"]["Insert"];
export type CandidateRootUpdate = Database["public"]["Tables"]["ai_trends_candidate_roots"]["Update"];
export type GameKeywordRow = Database["public"]["Tables"]["game_keywords"]["Row"];
export type GameKeywordInsert = Database["public"]["Tables"]["game_keywords"]["Insert"];
export type GameKeywordUpdate = Database["public"]["Tables"]["game_keywords"]["Update"];

export const deleteAllTrendKeywords = async (): Promise<number> => {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_keywords")
    .delete()
    .not("id", "is", null)
    .select("id");

  if (error) {
    throw error;
  }

  return (data as { id: string }[] | null)?.length ?? 0;
};

export const deleteCandidateRootsBySource = async (source: string): Promise<number> => {
  const trimmed = source.trim();
  if (!trimmed) {
    return 0;
  }

  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("ai_trends_candidate_roots")
    .delete()
    .eq("source", trimmed)
    .select("id");

  if (error) {
    throw error;
  }

  return (data as { id: string }[] | null)?.length ?? 0;
};

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

export const getRecentNewsItems = async (
  params: { withinHours?: number; limit?: number } = {}
): Promise<NewsItemRow[]> => {
  const { withinHours = 48, limit = 100 } = params;
  const client = getSupabaseAdmin();

  const { data, error } = await client
    .from("ai_trends_news")
    .select("id, title, source, published_at, created_at, keywords, metadata")
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const items: NewsItemRow[] = data ?? [];

  if (!withinHours || withinHours <= 0) {
    return items;
  }

  const thresholdMs = Date.now() - withinHours * 60 * 60 * 1000;

  return items.filter((item) => {
    const reference = item.published_at ?? item.created_at;
    if (!reference) {
      return true;
    }

    const date = new Date(reference);
    if (Number.isNaN(date.getTime())) {
      return true;
    }

    return date.getTime() >= thresholdMs;
  });
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

const normalizeGameKeyword = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeGameKeywordStatus = (value?: string | null): "accepted" | "filtered" => {
  if (!value) {
    return "accepted";
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "filtered" ? "filtered" : "accepted";
};

const trimValue = (value: string | null | undefined) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export type GameKeywordUpsertChunk = {
  index: number;
  total: number;
  chunkSize: number;
  inserted: number;
  updated: number;
  error?: {
    reason: string;
    details?: string | null;
    code?: string | null;
    hint?: string | null;
  };
};

export const upsertGameKeywords = async (
  records: Array<
    Omit<GameKeywordInsert, "normalized_keyword" | "inserted_at" | "updated_at"> & {
      normalized_keyword?: string;
      inserted_at?: string;
      updated_at?: string;
    }
  >,
  onChunk?: (chunk: GameKeywordUpsertChunk) => void
): Promise<{ inserted: number; updated: number; rows: GameKeywordRow[] }> => {
  if (records.length === 0) {
    return { inserted: 0, updated: 0, rows: [] };
  }

  const client = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const payloadPrep = records.map((record) => {
    const siteName = record.site_name.trim();
    const normalizedKeyword = record.normalized_keyword
      ? normalizeGameKeyword(record.normalized_keyword)
      : normalizeGameKeyword(record.keyword);
    const status = normalizeGameKeywordStatus((record as GameKeywordInsert).status);
    const filterReason = trimValue((record as GameKeywordInsert).filter_reason ?? null);
    const filterDetail = trimValue((record as GameKeywordInsert).filter_detail ?? null);

    return {
      keyword: record.keyword.trim(),
      normalized_keyword: normalizedKeyword,
      site_name: siteName,
      source_url: record.source_url.trim(),
      lang: record.lang ? record.lang.trim() : "unknown",
      last_seen_url: trimValue(record.last_seen_url ?? record.source_url),
      status,
      filter_reason: status === "filtered" ? filterReason : null,
      filter_detail: status === "filtered" ? filterDetail : null,
      inserted_at: record.inserted_at ?? nowIso,
      updated_at: record.updated_at ?? nowIso,
    } satisfies GameKeywordInsert;
  });

const existingMap = new Map<string, { inserted_at: string }>();
const SITE_LOOKUP_CHUNK = 75;
const SITE_LOOKUP_MAX_QUERY_LENGTH = 6000;

const getQueryLength = (values: string[]) => {
  if (values.length === 0) {
    return 0;
  }

  let length = 0;
  for (let index = 0; index < values.length; index++) {
    length += encodeURIComponent(values[index]).length;
    if (index > 0) {
      length += 1; // comma
    }
  }
  return length;
};

const siteBuckets = payloadPrep.reduce<Record<string, GameKeywordInsert[]>>((acc, item) => {
  const bucket = acc[item.site_name] ?? [];
  bucket.push(item);
  acc[item.site_name] = bucket;
    return acc;
  }, {});

const fetchExistingRows = async (siteName: string, values: string[]) => {
  if (values.length === 0) {
    return;
  }

  const { data, error } = await client
    .from("game_keywords")
    .select("normalized_keyword, inserted_at")
    .eq("site_name", siteName)
    .in("normalized_keyword", values);

  if (error) {
    throw error;
  }

  const rows = (data as Array<Pick<GameKeywordRow, "normalized_keyword" | "inserted_at">> | null) ?? [];
  rows.forEach((row) => {
    const key = `${siteName}::${row.normalized_keyword}`;
    existingMap.set(key, { inserted_at: row.inserted_at });
  });
};

  for (const [siteName, entries] of Object.entries(siteBuckets)) {
    const normalizedList = entries.map((entry) => entry.normalized_keyword);
    for (let index = 0; index < normalizedList.length; ) {
      let end = Math.min(index + SITE_LOOKUP_CHUNK, normalizedList.length);
      let slice = normalizedList.slice(index, end);

      while (slice.length > 1 && getQueryLength(slice) > SITE_LOOKUP_MAX_QUERY_LENGTH) {
        end = index + Math.max(1, Math.floor(slice.length / 2));
        slice = normalizedList.slice(index, end);
      }

      await fetchExistingRows(siteName, slice);
      index = end;
    }
  }

  let insertedCount = 0;

  const payloadEntries = payloadPrep.map((item) => {
    const key = `${item.site_name}::${item.normalized_keyword}`;
    const existing = existingMap.get(key);

    if (existing) {
      return {
        record: {
          ...item,
          inserted_at: existing.inserted_at,
          updated_at: nowIso,
        } satisfies GameKeywordInsert,
        isNew: false,
      };
    }

    insertedCount += 1;
    return {
      record: item,
      isNew: true,
    };
  });

  const payload = payloadEntries.map((entry) => entry.record);

  const UPSERT_CHUNK_SIZE = 50;
  const rows: GameKeywordRow[] = [];
  const totalChunks = Math.ceil(payload.length / UPSERT_CHUNK_SIZE) || 1;

  for (let index = 0; index < payload.length; index += UPSERT_CHUNK_SIZE) {
    const entrySlice = payloadEntries.slice(index, index + UPSERT_CHUNK_SIZE);
    if (entrySlice.length === 0) {
      continue;
    }

    const chunkRecords = entrySlice.map((entry) => entry.record);
    const chunkInserted = entrySlice.filter((entry) => entry.isNew).length;
    const chunkUpdated = entrySlice.length - chunkInserted;
    const chunkIndex = Math.floor(index / UPSERT_CHUNK_SIZE) + 1;

    try {
      const { data, error } = await (client.from("game_keywords") as any)
        .upsert(chunkRecords as any, { onConflict: "site_name,normalized_keyword" })
        .select("*");

      if (error) {
        throw error;
      }

      if (Array.isArray(data)) {
        rows.push(...(data as GameKeywordRow[]));
      }

      onChunk?.({
        index: chunkIndex,
        total: totalChunks,
        chunkSize: entrySlice.length,
        inserted: chunkInserted,
        updated: chunkUpdated,
      });
    } catch (error) {
      const pgError = error as PostgrestError;
      const reason = pgError?.message ?? (error as Error).message ?? "unknown error";
      const sampleKeywords = entrySlice
        .slice(0, 5)
        .map((entry) => `${entry.record.site_name}:${entry.record.keyword}`);

      console.error("[game-refresh] chunk upsert failed", {
        chunkIndex,
        totalChunks,
        chunkSize: entrySlice.length,
        sampleSite: entrySlice[0]?.record.site_name,
        sampleKeywords,
        reason,
        details: pgError?.details,
        code: pgError?.code,
        hint: pgError?.hint,
        raw: error,
      });

      onChunk?.({
        index: chunkIndex,
        total: totalChunks,
        chunkSize: entrySlice.length,
        inserted: chunkInserted,
        updated: chunkUpdated,
        error: {
          reason,
          details: pgError?.details,
          code: pgError?.code,
          hint: pgError?.hint,
        },
      });

      throw error;
    }
  }

  const updatedCount = payload.length - insertedCount;

  return { inserted: insertedCount, updated: updatedCount, rows };
};

export const getLatestGameKeywords = async (
  params: { limit?: number; status?: "accepted" | "filtered" } = {}
): Promise<GameKeywordRow[]> => {
  const client = getSupabaseAdmin();
  const { limit = 500, status } = params;

  let query = client
    .from("game_keywords")
    .select("*")
    .order("inserted_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as GameKeywordRow[];
};

export const getGameKeywordStats = async (): Promise<{
  total: number;
  accepted: number;
  filtered: number;
  lastAcceptedAt: string | null;
  lastFilteredAt: string | null;
}> => {
  const client = getSupabaseAdmin();
  const [
    { count: acceptedCount, error: acceptedError },
    { count: filteredCount, error: filteredError },
    { data: latestAcceptedData, error: latestAcceptedError },
    { data: latestFilteredData, error: latestFilteredError },
  ] = await Promise.all([
    client.from("game_keywords").select("id", { count: "exact", head: true }).eq("status", "accepted"),
    client.from("game_keywords").select("id", { count: "exact", head: true }).eq("status", "filtered"),
    client
      .from("game_keywords")
      .select("inserted_at")
      .eq("status", "accepted")
      .order("inserted_at", { ascending: false })
      .limit(1),
    client
      .from("game_keywords")
      .select("updated_at")
      .eq("status", "filtered")
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  if (acceptedError) throw acceptedError;
  if (filteredError) throw filteredError;
  if (latestAcceptedError) throw latestAcceptedError;
  if (latestFilteredError) throw latestFilteredError;

  const latestAcceptedRows = (latestAcceptedData as Array<Pick<GameKeywordRow, "inserted_at">> | null) ?? [];
  const latestFilteredRows = (latestFilteredData as Array<Pick<GameKeywordRow, "updated_at">> | null) ?? [];

  const accepted = typeof acceptedCount === "number" ? acceptedCount : 0;
  const filtered = typeof filteredCount === "number" ? filteredCount : 0;

  return {
    total: accepted + filtered,
    accepted,
    filtered,
    lastAcceptedAt: latestAcceptedRows.length > 0 ? latestAcceptedRows[0].inserted_at ?? null : null,
    lastFilteredAt: latestFilteredRows.length > 0 ? latestFilteredRows[0].updated_at ?? null : null,
  };
};
