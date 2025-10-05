import { dataForSeoFetch } from "@/lib/dataforseo";
import { developedMarkets, trendTimeframes, env } from "@/lib/env";
import {
  createTrendRun,
  getActiveRoots,
  getRunTaskCostTotal,
  getRunTaskStatusCounts,
  getTrendRunById,
  getTrendTaskByTaskId,
  insertTrendTasks,
  updateTrendRunById,
  updateTrendTask,
  type TrendRootRow,
  type TrendsTaskRow,
  type TrendRunRow,
} from "@/lib/supabase";
import type { Json } from "@/types/supabase";
import {
  DEFAULT_MARKETS,
  DEFAULT_TIMEFRAMES,
  decodeMetadataTag,
  encodeMetadataTag,
  mapStatusCodeToTaskStatus,
  normalizeTimeframe,
} from "@/lib/trends/utils";
import type { TaskMetadata } from "@/types/tasks";

const MARKET_INFO: Record<string, { code: number; name: string; language_name: string }> = {
  us: { code: 2840, name: "United States", language_name: "English" },
  gb: { code: 2826, name: "United Kingdom", language_name: "English" },
  de: { code: 2276, name: "Germany", language_name: "German" },
  fr: { code: 2250, name: "France", language_name: "French" },
  ca: { code: 2124, name: "Canada", language_name: "English" },
  au: { code: 2036, name: "Australia", language_name: "English" },
  nz: { code: 2248, name: "New Zealand", language_name: "English" },
  se: { code: 2608, name: "Sweden", language_name: "English" },
  sg: { code: 2706, name: "Singapore", language_name: "English" },
  jp: { code: 2392, name: "Japan", language_name: "Japanese" },
  kr: { code: 2417, name: "South Korea", language_name: "Korean" },
};

export type ExploreTaskPayload = {
  time_range: string;
  keywords: string[];
  location_name?: string;
  location_code?: number;
  language_name?: string;
  postback_url?: string;
  item_types?: string[];
  tag?: string;
};

export type QueuedExploreTask = {
  keyword: string;
  locale: string;
  timeframe: string;
  payload: ExploreTaskPayload;
  metadata: TaskMetadata;
  runId: string;
};

export type PostedExploreTask = {
  taskId: string;
  statusCode: number;
  statusMessage?: string;
  cost?: number;
  queue: QueuedExploreTask;
};

type DataForSeoTaskPostItem = {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
};

type DataForSeoTaskPostResponse = {
  status_code?: number;
  status_message?: string;
  tasks?: DataForSeoTaskPostItem[];
};

type DataForSeoCallbackTask = {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  result?: unknown;
  data?: Record<string, unknown> | null;
  tag?: string | null;
};

export type DataForSeoCallbackPayload = {
  status_code?: number;
  status_message?: string;
  tasks?: DataForSeoCallbackTask[];
};

const parseMarkets = () => {
  const configured = developedMarkets.length > 0 ? developedMarkets : DEFAULT_MARKETS;
  return configured.map((item) => item.trim().toLowerCase()).filter(Boolean);
};

const parseTimeframes = () => {
  const configured = trendTimeframes.length > 0 ? trendTimeframes : DEFAULT_TIMEFRAMES;
  return configured.map(normalizeTimeframe).map((item) => decodeURIComponent(item));
};

const resolveMarketInfo = (locale: string, fallbackKey: string) => {
  const normalized = locale.trim().toLowerCase();
  return MARKET_INFO[normalized] ?? MARKET_INFO[fallbackKey] ?? MARKET_INFO.us;
};

const buildPostbackUrl = (baseUrl: string) => {
  const url = new URL(baseUrl);
  if (env.AI_TRENDS_CALLBACK_TOKEN) {
    url.searchParams.set("token", env.AI_TRENDS_CALLBACK_TOKEN);
  }
  return url.toString();
};

const ALL_ITEM_TYPES = [
  "google_trends_graph",
  "google_trends_map",
  "google_trends_topics_list",
  "google_trends_queries_list",
];

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const toJsonRecord = (value: Json | null | undefined): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
};

const mergeRunMetadata = (current: Json | null | undefined, updates: Record<string, unknown>): Json => {
  return { ...toJsonRecord(current), ...updates } as unknown as Json;
};

const insertPostedTasks = async (posted: PostedExploreTask[]) => {
  if (posted.length === 0) {
    return;
  }

  const nowIso = new Date().toISOString();

  const records = posted.map(({ taskId, statusCode, statusMessage, cost, queue }) => ({
    run_id: queue.runId,
    task_id: taskId,
    keyword: queue.keyword,
    locale: queue.locale,
    timeframe: queue.timeframe,
    location_name: queue.payload.location_name ?? queue.metadata.location_name ?? null,
    location_code: queue.payload.location_code ?? queue.metadata.location_code ?? null,
    language_name: queue.payload.language_name ?? queue.metadata.language_name ?? null,
    status: mapStatusCodeToTaskStatus(statusCode),
    payload: {
      metadata: queue.metadata,
      request: queue.payload,
    } as unknown as Json,
    cost: typeof cost === "number" ? cost : null,
    posted_at: nowIso,
    error:
      statusCode >= 40000
        ? ({ status_code: statusCode, status_message: statusMessage ?? null } as unknown as Json)
        : null,
  }));

  try {
    await insertTrendTasks(records);
  } catch (error) {
    console.error("Failed to insert trend tasks", error);
  }
};

export const queueRootTasks = async (options: { callbackUrl: string }) => {
  const { callbackUrl } = options;
  const postbackUrl = buildPostbackUrl(callbackUrl);

  const roots: TrendRootRow[] = await getActiveRoots();
  if (roots.length === 0) {
    return {
      status: "ok" as const,
      posted: 0,
      errors: 0,
      details: [],
      runId: null,
    };
  }

  const markets = parseMarkets();
  const fallbackMarketKey = markets.find((market) => market !== "global") ?? "us";
  const timeframes = parseTimeframes();

  const runMetadata = {
    markets,
    timeframes,
    root_count: roots.length,
  } satisfies Record<string, unknown>;

  let run: TrendRunRow;
  try {
    run = await createTrendRun({
      status: "queued",
      trigger_source: "vercel/api/trends/run",
      root_keywords: roots.map((item) => item.keyword),
      metadata: runMetadata as unknown as Json,
    });
  } catch (error) {
    console.error("Failed to create trend run", error);
    throw error;
  }

  const runId = run.id;
  const queued: QueuedExploreTask[] = [];

  for (const root of roots) {
    for (const timeframe of timeframes) {
      if (root.locale === "global") {
        const metadata: TaskMetadata = {
          source: "root",
          root_id: root.id,
          root_keyword: root.keyword,
          root_label: root.label,
          locale: root.locale,
          time_range: timeframe,
          location_name: "Global",
        };

        const payload: ExploreTaskPayload = {
          time_range: timeframe,
          keywords: [root.keyword],
          postback_url: postbackUrl,
          item_types: ALL_ITEM_TYPES,
          tag: encodeMetadataTag(metadata),
        };

        queued.push({
          runId,
          keyword: root.keyword,
          locale: root.locale,
          timeframe,
          payload,
          metadata,
        });

        continue;
      }

      const market = resolveMarketInfo(root.locale, fallbackMarketKey);

      const metadata: TaskMetadata = {
        source: "root",
        root_id: root.id,
        root_keyword: root.keyword,
        root_label: root.label,
        locale: root.locale,
        time_range: timeframe,
        location_name: market.name,
        location_code: market.code,
        language_name: market.language_name,
      };

      const payload: ExploreTaskPayload = {
        time_range: timeframe,
        keywords: [root.keyword],
        location_name: market.name,
        location_code: market.code,
        language_name: market.language_name,
        postback_url: postbackUrl,
        item_types: ALL_ITEM_TYPES,
        tag: encodeMetadataTag(metadata),
      };

      queued.push({
        runId,
        keyword: root.keyword,
        locale: root.locale,
        timeframe,
        payload,
        metadata,
      });
    }
  }

  const batches = chunkArray(queued, 100);
  const posted: PostedExploreTask[] = [];
  const errors: Array<{ task: QueuedExploreTask; reason: string }> = [];

  for (const batch of batches) {
    try {
      const payload = batch.map((task) => task.payload);
      const response = await dataForSeoFetch<DataForSeoTaskPostResponse>(
        "/keywords_data/google_trends/explore/task_post",
        payload
      );

      const taskResponses = response.tasks ?? [];

      for (let index = 0; index < batch.length; index += 1) {
        const queueTask = batch[index];
        const apiTask = taskResponses[index];

        if (!apiTask?.id) {
          errors.push({ task: queueTask, reason: "Missing task id in DataForSEO response" });
          continue;
        }

        const statusCode = apiTask.status_code ?? 0;
        if (statusCode >= 40000) {
          errors.push({
            task: queueTask,
            reason: apiTask.status_message ?? "Unknown DataForSEO error",
          });
        }

        posted.push({
          taskId: apiTask.id,
          statusCode,
          statusMessage: apiTask.status_message,
          cost: apiTask.cost,
          queue: queueTask,
        });
      }
    } catch (error) {
      console.error("Failed to post root tasks", error);
      for (const task of batch) {
        errors.push({ task, reason: (error as Error).message });
      }
    }
  }

  await insertPostedTasks(posted);

  const nowIso = new Date().toISOString();
  const runStatus = posted.length === 0 ? "failed" : errors.length > 0 ? "running_with_errors" : "running";
  const initialCost = posted.reduce((accumulator, item) => {
    const cost = typeof item.cost === "number" ? item.cost : 0;
    return accumulator + (Number.isFinite(cost) ? cost : 0);
  }, 0);
  const metadataUpdate = mergeRunMetadata(run.metadata, {
    queued_tasks: queued.length,
    posted_tasks: posted.length,
    post_errors: errors.length,
    last_posted_at: nowIso,
    cost_posted_usd: initialCost,
  });

  try {
    await updateTrendRunById(runId, {
      status: runStatus,
      metadata: metadataUpdate,
    });
  } catch (error) {
    console.error("Failed to update trend run metadata", error);
  }

  return {
    status: "ok" as const,
    runId,
    posted: posted.length,
    errors: errors.length,
    details: errors,
  };
};

export const processDataForSeoCallback = async (payload: DataForSeoCallbackPayload) => {
  const tasks = payload.tasks ?? [];
  if (tasks.length === 0) {
    return { processed: 0, errors: 0, runsUpdated: 0 };
  }

  let processedCount = 0;
  let errorCount = 0;
  const runIds = new Set<string>();

  for (const task of tasks) {
    const taskId = task.id;
    if (!taskId) {
      continue;
    }

    const existingRecord = await getTrendTaskByTaskId(taskId);
    if (!existingRecord) {
      console.warn("Received callback for unknown task", taskId);
      continue;
    }

    const taskRecord: TrendsTaskRow = existingRecord;

    const statusCode = task.status_code ?? 0;
    const success = statusCode < 40000;

    let metadata = decodeMetadataTag(task.tag ?? undefined);
    if (!metadata) {
      const existingPayloadRecord = toJsonRecord(taskRecord.payload as Json);
      const existingMetadata = existingPayloadRecord.metadata;
      if (existingMetadata && typeof existingMetadata === "object") {
        metadata = existingMetadata as TaskMetadata;
      }
    }

    const existingPayloadRecord = toJsonRecord(taskRecord.payload as Json);
    const requestPayload = (() => {
      if (existingPayloadRecord.request && typeof existingPayloadRecord.request === "object") {
        return existingPayloadRecord.request as Record<string, unknown>;
      }

      if (task.data && typeof task.data === "object") {
        return task.data as Record<string, unknown>;
      }

      return null;
    })();

    const payloadForStorage = {
      metadata,
      request: requestPayload,
      result: task.result ?? null,
    };

    try {
      await updateTrendTask(taskId, {
        status: success ? "completed" : "error",
        payload: payloadForStorage as unknown as Json,
        completed_at: new Date().toISOString(),
        cost:
          typeof task.cost === "number"
            ? task.cost
            : typeof taskRecord.cost === "number"
            ? taskRecord.cost
            : null,
        error: success ? null : (task as unknown as Json),
      });
    } catch (error) {
      console.error("Failed to update trend task from callback", error);
    }

    processedCount += 1;
    if (!success) {
      errorCount += 1;
    }

    if (existingRecord.run_id) {
      runIds.add(existingRecord.run_id);
    }
  }

  const nowIso = new Date().toISOString();

  for (const runId of runIds) {
    try {
      const [counts, run, costTotal] = await Promise.all([
        getRunTaskStatusCounts(runId),
        getTrendRunById(runId),
        getRunTaskCostTotal(runId),
      ]);

      if (!run) {
        continue;
      }

      const status = counts.queued > 0
        ? counts.error > 0
          ? "running_with_errors"
          : "running"
        : counts.error > 0
        ? "completed_with_errors"
        : "completed";

      const metadataUpdate = mergeRunMetadata(run.metadata, {
        last_callback_at: nowIso,
        task_counts: counts,
        cost_total_usd: costTotal,
      });

      await updateTrendRunById(runId, {
        status,
        metadata: metadataUpdate,
      });
    } catch (error) {
      console.error("Failed to update trend run after callback", error);
    }
  }

  return { processed: processedCount, errors: errorCount, runsUpdated: runIds.size };
};
