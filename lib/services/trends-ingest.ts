import { dataForSeoFetch } from "@/lib/dataforseo";
import { developedMarkets, trendTimeframes, env } from "@/lib/env";
import {
  createTrendRun,
  deleteAllTrendKeywords,
  deleteCandidateRootsBySource,
  getActiveRoots,
  getRecentNewsItems,
  getRunTaskCostTotal,
  getRunTaskStatusCounts,
  getTrendKeywordByKey,
  getTrendRunById,
  getTrendTaskByTaskId,
  insertTrendTasks,
  updateTrendRunById,
  updateTrendTask,
  upsertTrendKeyword,
  type TrendRootRow,
  type TrendsTaskRow,
  type TrendRunRow,
  type TrendKeywordRow,
} from "@/lib/supabase";
import {
  expireStaleCandidates,
  fetchApprovedCandidateRoots,
  markCandidatesQueued,
  type CandidateSeed,
} from "@/lib/services/candidates";
import { harvestSignals } from "@/lib/signals/ingest";
import type { Json } from "@/types/supabase";
import { normalizeTaskResults } from "@/lib/tasks/dataforseo";
import type { ExploreItem } from "@/lib/tasks/dataforseo";
import {
  DEFAULT_MARKETS,
  DEFAULT_TIMEFRAMES,
  analyzeKeywordSpike,
  decodeMetadataTag,
  extractRisingQueryEntries,
  extractGraphSeriesForKeyword,
  mapStatusCodeToTaskStatus,
  normalizeKeyword,
  normalizeTimeframe,
  type KeywordSeriesPoint,
  type RisingQueryEntry,
} from "@/lib/trends/utils";
import type { TaskMetadata } from "@/types/tasks";
import {
  NEW_KEYWORD_MAX_AGE_MS,
  NEWS_KEYWORD_MAX_SEEDS,
  NEWS_KEYWORD_WINDOW_HOURS,
  RISING_QUEUE_THRESHOLD,
  SPIKE_DECAY_MAX_VALUE,
  SPIKE_DECAY_WINDOW_HOURS,
} from "@/lib/trends/constants";
import {
  assessKeywordDemand,
  isToolDemand,
  sanitizeDemandAssessment,
  type DemandDecisionLabel,
  type KeywordDemandAssessment,
} from "@/lib/services/keyword-demand";

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

const MARKET_NAME_LOOKUP = new Map<string, string>(
  Object.entries(MARKET_INFO).map(([code, info]) => [info.name.trim().toLowerCase(), code])
);

type MapExploreItem = Extract<ExploreItem, { type: "google_trends_map" }>;

const isMapExploreItem = (item: ExploreItem): item is MapExploreItem => item.type === "google_trends_map";

const normalizeGeoId = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  const [primary] = trimmed.split(/[-_]/);
  if (!primary || primary === "global" || primary === "worldwide") {
    return undefined;
  }

  return primary;
};

const normalizeMarketName = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "global" || trimmed === "worldwide") {
    return undefined;
  }

  return MARKET_NAME_LOOKUP.get(trimmed) ?? trimmed;
};

const normalizeGeoIdentifier = (geoId?: string | null, geoName?: string | null) =>
  normalizeGeoId(geoId) ?? normalizeMarketName(geoName);

const extractTopRankedMarkets = (result: unknown, limit = 3): string[] => {
  const normalizedResults = normalizeTaskResults(result);
  if (normalizedResults.length === 0) {
    return [];
  }

  type Candidate = { key: string; value: number };

  const candidates: Candidate[] = [];

  for (const entry of normalizedResults) {
    for (const resultItem of entry.results) {
      for (const item of resultItem.items) {
        if (!isMapExploreItem(item)) {
          continue;
        }

        for (const mapEntry of item.data ?? []) {
          const key = normalizeGeoIdentifier(mapEntry.geoId, mapEntry.geoName);
          if (!key) {
            continue;
          }

          const value =
            typeof mapEntry.value === "number" && Number.isFinite(mapEntry.value) ? mapEntry.value : 0;
          candidates.push({ key, value });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((a, b) => b.value - a.value);

  const seen = new Set<string>();
  const top: string[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.key)) {
      continue;
    }

    seen.add(candidate.key);
    top.push(candidate.key);

    if (top.length >= limit) {
      break;
    }
  }

  return top;
};

const findDevelopedMarketMatch = (result: unknown, markets: string[]) => {
  const topMarkets = extractTopRankedMarkets(result, 1);
  const marketSet = new Set(markets);
  const topCandidate = topMarkets[0];
  const matchedMarket = topCandidate && marketSet.has(topCandidate) ? topCandidate : undefined;
  return { topMarkets, matchedMarket } as const;
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

const MAX_DISCOVERY_DEPTH = 2;
const NEW_KEYWORD_MAX_AGE_DAYS = Math.ceil(NEW_KEYWORD_MAX_AGE_MS / (24 * 60 * 60 * 1000));

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const decodeURIComponentSafe = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const SPIKE_DECAY_WINDOW_MS = SPIKE_DECAY_WINDOW_HOURS * 60 * 60 * 1000;

const hasSpikeDecayed = (series: KeywordSeriesPoint[]): boolean => {
  if (!Array.isArray(series) || series.length === 0) {
    return false;
  }

  const latest = series[series.length - 1];
  if (!latest) {
    return false;
  }

  if (typeof latest.value === "number" && latest.value > SPIKE_DECAY_MAX_VALUE) {
    return false;
  }

  const nowMs = Date.now();
  const windowStart = nowMs - SPIKE_DECAY_WINDOW_MS;
  const recentPoints = series.filter((point) => point.timestamp >= windowStart);

  if (recentPoints.length === 0) {
    return (latest.value ?? 0) <= SPIKE_DECAY_MAX_VALUE;
  }

  const recentMax = Math.max(...recentPoints.map((point) => point.value ?? 0));
  return recentMax <= SPIKE_DECAY_MAX_VALUE;
};

const toKeywordDemandAssessment = (
  value: TaskMetadata["demand_assessment"] | undefined | null
): KeywordDemandAssessment | null => {
  if (!value) {
    return null;
  }

  const rawLabel = typeof value.label === "string" ? value.label.trim().toLowerCase() : "unclear";
  const label: DemandDecisionLabel = rawLabel === "tool" || rawLabel === "non_tool" ? (rawLabel as DemandDecisionLabel) : "unclear";

  return {
    enabled: true,
    label,
    score: typeof value.score === "number" && Number.isFinite(value.score) ? value.score : null,
    reason: typeof value.reason === "string" ? value.reason : null,
    demandSummary:
      typeof value.summary === "string" && value.summary.trim().length > 0 ? value.summary.trim() : null,
  };
};

const isWithinNewKeywordWindow = (existing: TrendKeywordRow | null | undefined) => {
  if (!existing) {
    return true;
  }

  const firstSeen = existing.first_seen;
  if (!firstSeen) {
    return true;
  }

  const firstSeenDate = new Date(firstSeen);
  if (Number.isNaN(firstSeenDate.getTime())) {
    return true;
  }

  const ageMs = Date.now() - firstSeenDate.getTime();
  if (ageMs < 0) {
    return true;
  }

  return ageMs <= NEW_KEYWORD_MAX_AGE_MS;
};

const isDevelopedMarket = (locale?: string | null) => {
  if (!locale) {
    return false;
  }

  const normalized = locale.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === "global" || normalized === "worldwide") {
    return false;
  }

  const markets = parseMarkets();
  return markets.includes(normalized);
};

type PostedExploreTaskResult = {
  posted: PostedExploreTask[];
  errors: Array<{ task: QueuedExploreTask; reason: string }>;
};

const postExploreTasks = async (tasks: QueuedExploreTask[]): Promise<PostedExploreTaskResult> => {
  if (tasks.length === 0) {
    return { posted: [], errors: [] };
  }

  console.log("Posting DataForSEO explore tasks", {
    count: tasks.length,
    keywords: tasks.map((task) => task.keyword),
  });

  const batches = chunkArray(tasks, 100);
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
      console.error("Failed to post explore tasks", error);
      for (const task of batch) {
        errors.push({ task, reason: (error as Error).message });
      }
    }
  }

  await insertPostedTasks(posted);

  console.log("Posted DataForSEO explore tasks result", {
    requested: tasks.length,
    posted: posted.length,
    errors: errors.length,
  });

  return { posted, errors };
};



type RisingExpansionOutcome = {
  queuedTasks: number;
};

const handleRisingKeywordExpansion = async (params: {
  taskRecord: TrendsTaskRow;
  metadata?: TaskMetadata;
  requestPayload?: Record<string, unknown> | null;
  taskResult: unknown;
}): Promise<RisingExpansionOutcome> => {
  const { taskRecord, metadata, requestPayload, taskResult } = params;

  if (!metadata) {
    console.debug("Skip rising expansion: missing metadata", {
      taskId: taskRecord.task_id,
    });
    return { queuedTasks: 0 };
  }

  const runId = taskRecord.run_id;
  if (!runId) {
    console.debug("Skip rising expansion: missing runId", {
      taskId: taskRecord.task_id,
    });
    return { queuedTasks: 0 };
  }

  if (!metadata.root_id || !metadata.root_keyword || !metadata.root_label) {
    console.debug("Skip rising expansion: incomplete root metadata", {
      taskId: taskRecord.task_id,
      metadata,
    });
    return { queuedTasks: 0 };
  }

  const developedMarketsList = parseMarkets();
  const developedMarketSet = new Set(developedMarketsList);

  const fallbackLocaleRaw = metadata.locale ?? taskRecord.locale ?? "";
  const normalizedLocale = fallbackLocaleRaw.trim().toLowerCase();
  const { topMarkets, matchedMarket } = findDevelopedMarketMatch(taskResult, developedMarketsList);
  const effectiveLocale = ((matchedMarket ?? normalizedLocale) || "global").trim().toLowerCase();
  const isRootTask = metadata.source === "root";
  const currentDepth = (() => {
    const depthValue = metadata.discovery_depth;
    if (typeof depthValue === "number" && Number.isFinite(depthValue)) {
      return depthValue < 0 ? 0 : Math.floor(depthValue);
    }
    return isRootTask ? 0 : 1;
  })();
  const nextDepth = currentDepth + 1;
  const canExpand = nextDepth < MAX_DISCOVERY_DEPTH;

  if (!isRootTask && !matchedMarket && !developedMarketSet.has(effectiveLocale)) {
    console.debug("Skip rising expansion: locale not in developed markets", {
      taskId: taskRecord.task_id,
      locale: normalizedLocale,
      topMarkets,
    });
    return { queuedTasks: 0 };
  }

  const locale = effectiveLocale || "global";
  const isGlobalMarket = locale === "global" || locale === "worldwide";

  let locationName = metadata.location_name ?? taskRecord.location_name ?? undefined;
  let locationCode = metadata.location_code ?? taskRecord.location_code ?? undefined;
  let languageName = metadata.language_name ?? taskRecord.language_name ?? undefined;

  if (matchedMarket) {
    const fallbackMarketKey = normalizedLocale && normalizedLocale !== matchedMarket ? normalizedLocale : matchedMarket;
    const market = resolveMarketInfo(matchedMarket, fallbackMarketKey);
    locationName = market.name;
    locationCode = market.code;
    languageName = market.language_name;
  } else if (isGlobalMarket) {
    locationName = undefined;
    locationCode = undefined;
    languageName = undefined;
  }

  const timeRangeRaw = metadata.time_range ?? taskRecord.timeframe;
  if (!timeRangeRaw) {
    console.debug("Skip rising expansion: missing timeframe", {
      taskId: taskRecord.task_id,
    });
    return { queuedTasks: 0 };
  }

  const timeframeKey = normalizeTimeframe(decodeURIComponentSafe(timeRangeRaw));

  if (!canExpand) {
    console.debug("Skip rising expansion depth for queueing", {
      taskId: taskRecord.task_id,
      runId,
      depth: currentDepth,
      maxDepth: MAX_DISCOVERY_DEPTH,
    });
  }

  const risingEntries = extractRisingQueryEntries(taskResult);
  if (risingEntries.length === 0) {
    console.debug("Skip rising expansion: no rising entries", {
      taskId: taskRecord.task_id,
    });
    return { queuedTasks: 0 };
  }

  const filteredEntries = risingEntries.filter((entry) => entry.value >= RISING_QUEUE_THRESHOLD);
  if (filteredEntries.length === 0) {
    console.debug("Skip rising expansion: entries below threshold", {
      taskId: taskRecord.task_id,
      threshold: RISING_QUEUE_THRESHOLD,
      maxValue: Math.max(...risingEntries.map((item) => item.value)),
    });
    return { queuedTasks: 0 };
  }

  const parentKeywordNormalized = normalizeKeyword(taskRecord.keyword);
  const rootKeywordNormalized = normalizeKeyword(metadata.root_keyword);
  const seenKeywords = new Set<string>();
  const uniqueEntries: RisingQueryEntry[] = [];

  for (const entry of filteredEntries) {
    const keyword = entry.keyword.trim();
    if (!keyword) {
      console.debug("Skip rising entry: empty keyword", {
        taskId: taskRecord.task_id,
      });
      continue;
    }

    const normalized = normalizeKeyword(keyword);
    if (!normalized || normalized === parentKeywordNormalized || normalized === rootKeywordNormalized) {
      console.debug("Skip rising entry: duplicates or matches parent/root", {
        taskId: taskRecord.task_id,
        keyword,
        normalized,
      });
      continue;
    }

    if (seenKeywords.has(normalized)) {
      console.debug("Skip rising entry: already processed", {
        taskId: taskRecord.task_id,
        keyword,
      });
      continue;
    }

    seenKeywords.add(normalized);
    uniqueEntries.push({ keyword, value: entry.value });
  }

  if (uniqueEntries.length === 0) {
    console.debug("Skip rising expansion: no unique entries after filtering", {
      taskId: taskRecord.task_id,
    });
    return { queuedTasks: 0 };
  }

  console.log("Rising expansion candidates", {
    taskId: taskRecord.task_id,
    runId,
    timeframe: timeframeKey,
    candidateCount: uniqueEntries.length,
    candidates: uniqueEntries,
  });

  const existingRecords = await Promise.all(
    uniqueEntries.map((entry) =>
      getTrendKeywordByKey(entry.keyword, locale, timeframeKey).catch((error) => {
        console.error("Failed to fetch existing keyword", {
          keyword: entry.keyword,
          locale,
          timeframe: timeframeKey,
          error,
        });
        return null;
      })
    )
  );

  const postbackUrl = typeof requestPayload?.postback_url === "string" ? requestPayload.postback_url : undefined;

  const queued: QueuedExploreTask[] = [];

  for (let index = 0; index < uniqueEntries.length; index += 1) {
    const entry = uniqueEntries[index];
    const existing = existingRecords[index] ?? null;

    if (!isWithinNewKeywordWindow(existing)) {
      console.debug("Skip rising entry: outside new keyword window", {
        taskId: taskRecord.task_id,
        keyword: entry.keyword,
        firstSeen: existing?.first_seen,
        maxAgeDays: NEW_KEYWORD_MAX_AGE_DAYS,
      });
      continue;
    }

    if (!canExpand) {
      console.debug("Skip queueing rising entry", {
        taskId: taskRecord.task_id,
        keyword: entry.keyword,
        reason: "depth_limit_reached",
        depth: currentDepth,
        maxDepth: MAX_DISCOVERY_DEPTH,
      });
      continue;
    }

    if (!postbackUrl) {
      console.debug("Skip queueing rising entry", {
        taskId: taskRecord.task_id,
        keyword: entry.keyword,
        reason: "missing_postback_url",
      });
      continue;
    }

    let demandAssessment: KeywordDemandAssessment | null = null;
    try {
      demandAssessment = await assessKeywordDemand({
        keyword: entry.keyword,
        rootKeyword: metadata.root_keyword,
        parentKeyword: taskRecord.keyword,
        locale,
        timeframe: timeframeKey,
        spikeScore: entry.value,
        notes: "rising_expansion",
      });
    } catch (error) {
      console.error("Failed to run demand assessment for rising entry", {
        keyword: entry.keyword,
        error,
      });
    }

    if (demandAssessment && !isToolDemand(demandAssessment)) {
      console.debug("Skip rising entry: LLM rejected tool demand", {
        taskId: taskRecord.task_id,
        keyword: entry.keyword,
        label: demandAssessment.label,
        reason: demandAssessment.reason ?? null,
      });
      continue;
    }

    const childMetadata: TaskMetadata = {
      source: "rising",
      root_id: metadata.root_id,
      root_keyword: metadata.root_keyword,
      root_label: metadata.root_label,
      baseline: metadata.baseline,
      locale,
      time_range: timeframeKey,
      location_name: locationName,
      location_code: locationCode,
      language_name: languageName,
      parent_task_id: taskRecord.task_id,
      parent_keyword: taskRecord.keyword,
      discovery_depth: nextDepth,
    };

    const assessmentMetadata = sanitizeDemandAssessment(demandAssessment ?? undefined);
    if (assessmentMetadata) {
      childMetadata.demand_assessment = assessmentMetadata;
    }

    const payload: ExploreTaskPayload = {
      time_range: timeframeKey,
      keywords: [entry.keyword],
      location_name: childMetadata.location_name,
      location_code: childMetadata.location_code,
      language_name: childMetadata.language_name,
      postback_url: postbackUrl,
      item_types: ALL_ITEM_TYPES,
    };

    queued.push({
      runId,
      keyword: entry.keyword,
      locale: childMetadata.locale ?? taskRecord.locale,
      timeframe: timeframeKey,
      payload,
      metadata: childMetadata,
    });
  }

  let queuedTasks = 0;
  if (queued.length > 0) {
    const { posted, errors } = await postExploreTasks(queued);
    queuedTasks = posted.length;

    if (errors.length > 0) {
      console.warn("Errors while posting rising keyword tasks", {
        taskId: taskRecord.task_id,
        errors,
      });
    }
  }

  return { queuedTasks } satisfies RisingExpansionOutcome;
};

type KeywordDetectionResult = {
  keyword: string;
  priority?: string | null;
};

const evaluateKeywordFromTask = async (params: {
  taskRecord: TrendsTaskRow;
  metadata?: TaskMetadata;
  taskResult: unknown;
}): Promise<KeywordDetectionResult | null> => {
  const { taskRecord, metadata, taskResult } = params;

  if (!metadata || metadata.source !== "rising") {
    return null;
  }

  const keyword = typeof taskRecord.keyword === "string" ? taskRecord.keyword.trim() : "";
  if (!keyword) {
    return null;
  }

  const localeValue = (metadata.locale ?? taskRecord.locale ?? "global").trim().toLowerCase() || "global";
  const timeRangeRaw = metadata.time_range ?? taskRecord.timeframe;
  if (!timeRangeRaw) {
    console.debug("Skip keyword spike: missing timeframe", {
      taskId: taskRecord.task_id,
      keyword,
    });
    return null;
  }

  if (!taskResult) {
    console.debug("Skip keyword spike: missing task result", {
      taskId: taskRecord.task_id,
      keyword,
    });
    return null;
  }

  const timeframeKey = normalizeTimeframe(decodeURIComponentSafe(timeRangeRaw));
  const analysis = analyzeKeywordSpike({ result: taskResult, keyword });

  if (!analysis.qualifies || !analysis.firstSeenAt || !analysis.lastSeenAt) {
    console.debug("Skip keyword spike: analysis not qualified", {
      taskId: taskRecord.task_id,
      keyword,
      reason: analysis.reason ?? null,
      baselineMax: analysis.baselineMax ?? null,
      recentMax: analysis.recentMax ?? null,
    });
    return null;
  }

  const series = extractGraphSeriesForKeyword(taskResult, keyword);
  if (hasSpikeDecayed(series)) {
    console.debug("Skip keyword spike: demand decayed", {
      taskId: taskRecord.task_id,
      keyword,
      latestValue: series.length > 0 ? series[series.length - 1]?.value ?? null : null,
      windowHours: SPIKE_DECAY_WINDOW_HOURS,
    });
    return null;
  }

  const firstSeenDate = new Date(analysis.firstSeenAt);
  if (Number.isNaN(firstSeenDate.getTime())) {
    console.debug("Skip keyword spike: invalid firstSeen date", {
      taskId: taskRecord.task_id,
      keyword,
      firstSeen: analysis.firstSeenAt,
    });
    return null;
  }

  if (Date.now() - firstSeenDate.getTime() > NEW_KEYWORD_MAX_AGE_MS) {
    console.debug("Skip keyword spike: outside new keyword window", {
      taskId: taskRecord.task_id,
      keyword,
      firstSeen: analysis.firstSeenAt,
    });
    return null;
  }

  let existing: TrendKeywordRow | null = null;
  try {
    existing = await getTrendKeywordByKey(keyword, localeValue, timeframeKey);
  } catch (error) {
    console.error("Failed to fetch existing keyword prior to spike evaluation", {
      keyword,
      locale: localeValue,
      timeframe: timeframeKey,
      error,
    });
  }

  if (!isWithinNewKeywordWindow(existing)) {
    console.debug("Skip keyword spike: existing record outside window", {
      taskId: taskRecord.task_id,
      keyword,
      existingFirstSeen: existing?.first_seen ?? null,
    });
    return null;
  }

  const existingMetadata = existing ? toJsonRecord(existing.metadata as Json) : {};
  const existingDemandRaw =
    existingMetadata && typeof existingMetadata === "object" && "demand_assessment" in existingMetadata
      ? (existingMetadata.demand_assessment as TaskMetadata["demand_assessment"])
      : null;

  let demandAssessment =
    toKeywordDemandAssessment(metadata.demand_assessment) ?? toKeywordDemandAssessment(existingDemandRaw);

  if (!demandAssessment || demandAssessment.label === "unclear" || !demandAssessment.demandSummary) {
    demandAssessment = await assessKeywordDemand({
      keyword,
      rootKeyword: metadata.root_keyword,
      parentKeyword: metadata.parent_keyword ?? taskRecord.keyword,
      locale: localeValue,
      timeframe: timeframeKey,
      spikeScore: analysis.spikeScore ?? analysis.recentMax ?? null,
      notes: analysis.priority ? `priority=${analysis.priority}` : null,
    });
  }

  if (demandAssessment && !isToolDemand(demandAssessment)) {
    console.debug("Skip keyword spike: demand assessment rejected", {
      taskId: taskRecord.task_id,
      keyword,
      label: demandAssessment.label,
      reason: demandAssessment.reason ?? null,
    });
    return null;
  }

  const sanitizedAssessment = sanitizeDemandAssessment(demandAssessment ?? undefined);
  const demandSummary = sanitizedAssessment?.summary ?? null;
  const nowIso = new Date().toISOString();
  const metadataUpdates = {
    ...existingMetadata,
    spike_detection: {
      run_id: taskRecord.run_id,
      task_id: taskRecord.task_id,
      updated_at: nowIso,
      baseline_max: analysis.baselineMax ?? null,
      recent_max: analysis.recentMax ?? null,
    },
  } as Record<string, unknown>;

  if (sanitizedAssessment) {
    metadataUpdates.demand_assessment = sanitizedAssessment;
  }

  const keywordSummary = (() => {
    if (demandSummary && demandSummary.length > 0) {
      const trimmed = demandSummary.trim();
      if (trimmed.length === 0) {
        return null;
      }
      return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
    }

    if (typeof existing?.summary === "string" && existing.summary.trim().length > 0) {
      const trimmed = existing.summary.trim();
      return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
    }

    return null;
  })();

  const firstSeen = (() => {
    if (existing?.first_seen) {
      const existingDate = new Date(existing.first_seen);
      if (!Number.isNaN(existingDate.getTime()) && existingDate.getTime() <= firstSeenDate.getTime()) {
        return existing.first_seen;
      }
    }
    return analysis.firstSeenAt;
  })();

  const lastSeen = (() => {
    const candidateDate = new Date(analysis.lastSeenAt);
    if (existing?.last_seen) {
      const existingDate = new Date(existing.last_seen);
      if (!Number.isNaN(existingDate.getTime()) && existingDate > candidateDate) {
        return existing.last_seen;
      }
    }
    return analysis.lastSeenAt;
  })();

  try {
    await upsertTrendKeyword({
      keyword,
      locale: localeValue,
      timeframe: timeframeKey,
      first_seen: firstSeen,
      last_seen: lastSeen,
      spike_score: analysis.spikeScore ?? null,
      priority: analysis.priority ?? null,
      summary: keywordSummary,
      metadata: metadataUpdates as unknown as Json,
    });
  } catch (error) {
    console.error("Failed to record keyword spike", {
      keyword,
      locale: localeValue,
      timeframe: timeframeKey,
      error,
    });
    return null;
  }

  console.log("Keyword spike recorded", {
    keyword,
    locale: localeValue,
    timeframe: timeframeKey,
    priority: analysis.priority ?? null,
    spikeScore: analysis.spikeScore ?? null,
  });

  return {
    keyword,
    priority: analysis.priority ?? null,
  } satisfies KeywordDetectionResult;
};

function toJsonRecord(value: Json | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function mergeRunMetadata(current: Json | null | undefined, updates: Record<string, unknown>): Json {
  return { ...toJsonRecord(current), ...updates } as unknown as Json;
}

type NewsSeedEntry = {
  newsId: string;
  keyword: string;
  locale: string;
  title: string | null;
  source: string | null;
  publishedAt: string | null;
};

const resolveNewsSeeds = async (params: {
  markets: string[];
  fallbackMarketKey: string;
  seenKeywords: Set<string>;
}): Promise<NewsSeedEntry[]> => {
  const { markets, fallbackMarketKey, seenKeywords } = params;
  const defaultLocale = markets.includes("global") ? "global" : fallbackMarketKey;

  const newsItems = await getRecentNewsItems({
    withinHours: NEWS_KEYWORD_WINDOW_HOURS,
    limit: NEWS_KEYWORD_MAX_SEEDS * 3,
  });

  if (newsItems.length === 0) {
    return [];
  }

  const seeds: NewsSeedEntry[] = [];

  for (const item of newsItems) {
    const keywords = Array.isArray(item.keywords) ? item.keywords : [];
    if (keywords.length === 0) {
      continue;
    }

    for (const candidate of keywords) {
      if (typeof candidate !== "string") {
        continue;
      }

      const keyword = candidate.trim();
      if (!keyword) {
        continue;
      }

      const normalized = normalizeKeyword(keyword);
      if (!normalized || seenKeywords.has(normalized)) {
        continue;
      }

      seeds.push({
        newsId: item.id,
        keyword,
        locale: defaultLocale,
        title: item.title ?? null,
        source: item.source ?? null,
        publishedAt: item.published_at ?? item.created_at ?? null,
      });

      seenKeywords.add(normalized);

      if (seeds.length >= NEWS_KEYWORD_MAX_SEEDS) {
        break;
      }
    }

    if (seeds.length >= NEWS_KEYWORD_MAX_SEEDS) {
      break;
    }
  }

  if (seeds.length > 0) {
    console.log("Resolved news keyword seeds", {
      count: seeds.length,
      keywords: seeds.map((seed) => seed.keyword),
    });
  }

  return seeds;
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

  const clearedKeywordCount = await deleteAllTrendKeywords();
  const clearedNewsCandidates = await deleteCandidateRootsBySource("news_keyword");

  console.log("Cleared previous keyword state", {
    keywords: clearedKeywordCount,
    newsCandidateRoots: clearedNewsCandidates,
  });

  let signalsHarvested = false;
  try {
    await harvestSignals();
    signalsHarvested = true;
  } catch (error) {
    console.error("Failed to harvest signals before queuing tasks", error);
  }

  if (!signalsHarvested) {
    await expireStaleCandidates();
  }

  const roots: TrendRootRow[] = await getActiveRoots();
  const markets = parseMarkets();
  const fallbackMarketKey = markets.find((market) => market !== "global") ?? "us";
  const timeframes = parseTimeframes();
  const seenSeedKeywords = new Set<string>();
  for (const root of roots) {
    const normalized = normalizeKeyword(root.keyword);
    if (normalized) {
      seenSeedKeywords.add(normalized);
    }
  }

  const newsSeeds = await resolveNewsSeeds({
    markets,
    fallbackMarketKey,
    seenKeywords: seenSeedKeywords,
  });

  const candidateSeeds = await fetchApprovedCandidateRoots({ limit: 40 });

  const rootKeywords = roots.map((item) => item.keyword);
  const newsKeywords = newsSeeds.map((seed) => seed.keyword);
  const seedKeywords = [...rootKeywords, ...newsKeywords];

  const selectedCandidateSeeds: CandidateSeed[] = [];
  const candidateKeywords: string[] = [];
  for (const candidate of candidateSeeds) {
    const normalized = normalizeKeyword(candidate.term);
    if (!normalized || seenSeedKeywords.has(normalized)) {
      continue;
    }

    seenSeedKeywords.add(normalized);
    seedKeywords.push(candidate.term);
    candidateKeywords.push(candidate.term);
    selectedCandidateSeeds.push(candidate);
  }

  if (seedKeywords.length === 0) {
    return {
      status: "ok" as const,
      posted: 0,
      errors: 0,
      details: [],
      runId: null,
    };
  }

  const candidateSourceCounts = selectedCandidateSeeds.reduce<Record<string, number>>((acc, seed) => {
    const key = seed.source ?? "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const runMetadata = {
    markets,
    timeframes,
    root_count: roots.length,
    news_keyword_count: newsSeeds.length,
    candidate_root_count: selectedCandidateSeeds.length,
    news_keyword_window_hours: NEWS_KEYWORD_WINDOW_HOURS,
    seed_keyword_total: seedKeywords.length,
    news_keywords: newsKeywords,
    candidate_keywords: candidateKeywords,
    candidate_sources: candidateSourceCounts,
  } satisfies Record<string, unknown>;

  let run: TrendRunRow;
  try {
    run = await createTrendRun({
      status: "queued",
      trigger_source: "vercel/api/trends/run",
      root_keywords: seedKeywords,
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
          discovery_depth: 0,
          locale: root.locale,
          time_range: timeframe,
          location_name: "Global",
        };

        const payload: ExploreTaskPayload = {
          time_range: timeframe,
          keywords: [root.keyword],
          postback_url: postbackUrl,
          item_types: ALL_ITEM_TYPES,
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
        discovery_depth: 0,
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

  for (const seed of newsSeeds) {
    for (const timeframe of timeframes) {
      const baseTitle = seed.title && seed.title.trim().length > 0 ? seed.title.trim() : null;
      const rootLabel = seed.source ? `${baseTitle ?? seed.keyword} · ${seed.source}` : baseTitle ?? seed.keyword;

      if (seed.locale === "global") {
        const metadata: TaskMetadata = {
          source: "root",
          root_id: seed.newsId,
          root_keyword: seed.keyword,
          root_label: rootLabel,
          discovery_depth: 0,
          locale: seed.locale,
          time_range: timeframe,
          location_name: "Global",
          seed_origin: "news",
          news_id: seed.newsId,
          news_source: seed.source,
          news_title: seed.title,
          news_published_at: seed.publishedAt,
        };

        const payload: ExploreTaskPayload = {
          time_range: timeframe,
          keywords: [seed.keyword],
          postback_url: postbackUrl,
          item_types: ALL_ITEM_TYPES,
        };

        queued.push({
          runId,
          keyword: seed.keyword,
          locale: seed.locale,
          timeframe,
          payload,
          metadata,
        });
        continue;
      }

      const market = resolveMarketInfo(seed.locale, fallbackMarketKey);

      const metadata: TaskMetadata = {
        source: "root",
        root_id: seed.newsId,
        root_keyword: seed.keyword,
        root_label: rootLabel,
        discovery_depth: 0,
        locale: seed.locale,
        time_range: timeframe,
        location_name: market.name,
        location_code: market.code,
        language_name: market.language_name,
        seed_origin: "news",
        news_id: seed.newsId,
        news_source: seed.source,
        news_title: seed.title,
        news_published_at: seed.publishedAt,
      };

      const payload: ExploreTaskPayload = {
        time_range: timeframe,
        keywords: [seed.keyword],
        location_name: market.name,
        location_code: market.code,
        language_name: market.language_name,
        postback_url: postbackUrl,
        item_types: ALL_ITEM_TYPES,
      };

      queued.push({
        runId,
        keyword: seed.keyword,
        locale: seed.locale,
        timeframe,
        payload,
        metadata,
      });
    }
  }

  for (const candidate of selectedCandidateSeeds) {
    const rootLabel = `${candidate.term} · ${candidate.source ?? "candidate"}`;
    for (const timeframe of timeframes) {
      const metadata: TaskMetadata = {
        source: "root",
        root_id: candidate.id,
        root_keyword: candidate.term,
        root_label: rootLabel,
        discovery_depth: 0,
        locale: "global",
        time_range: timeframe,
        location_name: "Global",
        seed_origin: "candidate",
        candidate_id: candidate.id,
        candidate_source: candidate.source ?? null,
        candidate_llm_label: candidate.label ?? null,
        candidate_llm_score: candidate.score ?? null,
        candidate_captured_at: candidate.capturedAt ?? null,
      };

      const payload: ExploreTaskPayload = {
        time_range: timeframe,
        keywords: [candidate.term],
        postback_url: postbackUrl,
        item_types: ALL_ITEM_TYPES,
      };

      queued.push({
        runId,
        keyword: candidate.term,
        locale: "global",
        timeframe,
        payload,
        metadata,
      });
    }
  }

  const { posted, errors } = await postExploreTasks(queued);

  const postedCandidateIds = new Set<string>();
  for (const item of posted) {
    const candidateId = item.queue.metadata.candidate_id;
    if (typeof candidateId === "string" && candidateId.trim().length > 0) {
      postedCandidateIds.add(candidateId);
    }
  }

  if (postedCandidateIds.size > 0) {
    await markCandidatesQueued(Array.from(postedCandidateIds));
  }

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
  const runExpansionStats = new Map<string, { queued: number; recorded: KeywordDetectionResult[] }>();

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

    if (taskRecord.run_id) {
      runIds.add(taskRecord.run_id);
    }

    if (success && taskRecord.run_id) {
      try {
        const expansion = await handleRisingKeywordExpansion({
          taskRecord,
          metadata,
          requestPayload,
          taskResult: task.result,
        });

        const stats = runExpansionStats.get(taskRecord.run_id) ?? { queued: 0, recorded: [] };
        let statsUpdated = false;

        if (expansion.queuedTasks > 0) {
          stats.queued += expansion.queuedTasks;
          statsUpdated = true;
        }

        const detection = await evaluateKeywordFromTask({
          taskRecord,
          metadata,
          taskResult: task.result,
        });

        if (detection) {
          stats.recorded.push(detection);
          statsUpdated = true;
        }

        if (statsUpdated) {
          runExpansionStats.set(taskRecord.run_id, stats);

          console.log("Rising expansion update", {
            taskId,
            runId: taskRecord.run_id,
            queuedTasks: expansion.queuedTasks,
            recordedKeyword: detection?.keyword ?? null,
            recordedPriority: detection?.priority ?? null,
          });
        }
      } catch (error) {
        console.error("Failed to expand rising keywords", {
          taskId,
          error,
        });
      }
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

      const metadataAddition: Record<string, unknown> = {
        last_callback_at: nowIso,
        task_counts: counts,
        cost_total_usd: costTotal,
      };

      const expansion = runExpansionStats.get(runId);
      if (expansion) {
        const priorityCounts = expansion.recorded.reduce<Record<string, number>>((acc, item) => {
          const key = (item.priority ?? "unknown").toString();
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {});

        const spikeSummary: Record<string, unknown> = {
          queued_tasks: expansion.queued,
          recorded_keywords: expansion.recorded.map((item) => item.keyword),
          priority_counts: priorityCounts,
          updated_at: nowIso,
        };

        console.log("Run-level spike summary", {
          runId,
          queuedTasks: expansion.queued,
          priorityCounts,
          recordedCount: expansion.recorded.length,
        });

        metadataAddition.keyword_spikes = spikeSummary;
      }

      const metadataUpdate = mergeRunMetadata(run.metadata, metadataAddition);

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
