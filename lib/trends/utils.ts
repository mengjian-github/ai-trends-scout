import { normalizeTaskResults, type ExploreItem } from "@/lib/tasks/dataforseo";
import {
  BASELINE_MAX_BEFORE_WINDOW,
  BREAKOUT_SENTINEL_VALUE,
  HOT_KEYWORD_WINDOW_HOURS,
  MIN_SPIKE_VALUE,
  NEW_KEYWORD_WINDOW_HOURS,
} from "@/lib/trends/constants";
import type { TaskMetadata } from "@/types/tasks";

export const DEFAULT_MARKETS = ["global"];
export const DEFAULT_TIMEFRAMES = ["past_7_days"];

const TIMEFRAME_ALIASES: Record<string, string> = {
  "now%201%2bd": "past_day",
  "now 1+d": "past_day",
  "now%207-d": "past_7_days",
  "now 7-d": "past_7_days",
};

export const normalizeTimeframe = (value: string) => TIMEFRAME_ALIASES[value] ?? value;

export const normalizeKeyword = (value: string) => value.trim().toLowerCase();

export type RisingQueryEntry = {
  keyword: string;
  value: number;
};

export type DiscoveryBucket = "24h" | "3d" | "7d" | "other";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const decodeMetadataTag = (tag: string | undefined | null): TaskMetadata | undefined => {
  if (!tag) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(tag);
    if (isObject(parsed)) {
      return parsed as TaskMetadata;
    }
  } catch (error) {
    console.error("Failed to decode metadata tag", error, tag.slice(0, 200));
  }

  return undefined;
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === "breakout") {
      return BREAKOUT_SENTINEL_VALUE;
    }

    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const extractQueriesFromList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const keywords: string[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const maybeKeyword =
      (entry as { query?: string; keyword?: string }).query ??
      (entry as { keyword?: string }).keyword;

    if (maybeKeyword && typeof maybeKeyword === "string") {
      keywords.push(maybeKeyword);
    }
  }

  return keywords;
};

const extractRisingQueryEntriesFromList = (value: unknown): RisingQueryEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: RisingQueryEntry[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const keyword =
      typeof (item as { query?: unknown }).query === "string"
        ? (item as { query: string }).query.trim()
        : typeof (item as { keyword?: unknown }).keyword === "string"
        ? (item as { keyword: string }).keyword.trim()
        : undefined;

    if (!keyword) {
      continue;
    }

    const valueNumber = normalizeRisingValue((item as { value?: unknown }).value);
    entries.push({ keyword, value: valueNumber });
  }

  return entries;
};

type QueryListExploreItem = Extract<ExploreItem, { type: "google_trends_queries_list" }>;
type TopicListExploreItem = Extract<ExploreItem, { type: "google_trends_topics_list" }>;

const isQueryListExploreItem = (item: ExploreItem): item is QueryListExploreItem =>
  item.type === "google_trends_queries_list";

const isTopicListExploreItem = (item: ExploreItem): item is TopicListExploreItem =>
  item.type === "google_trends_topics_list";

const normalizeRisingValue = (value: unknown) => {
  const parsed = toNumber(value);
  if (typeof parsed === "number") {
    return parsed;
  }
  return 0;
};

const ensureKeyword = (value: string | undefined | null) => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const extractRisingQueryEntriesFromQueryList = (item: QueryListExploreItem): RisingQueryEntry[] => {
  if (!Array.isArray(item.rising)) {
    return [];
  }

  const entries: RisingQueryEntry[] = [];

  for (const rising of item.rising) {
    const keyword = ensureKeyword(rising?.query);
    if (!keyword) {
      continue;
    }

    entries.push({ keyword, value: normalizeRisingValue(rising?.value) });
  }

  return entries;
};

const extractRisingQueryEntriesFromTopicList = (item: TopicListExploreItem): RisingQueryEntry[] => {
  if (!Array.isArray(item.rising)) {
    return [];
  }

  const entries: RisingQueryEntry[] = [];

  for (const rising of item.rising) {
    const keyword = ensureKeyword(rising?.title ?? rising?.type);
    if (!keyword) {
      continue;
    }

    entries.push({ keyword, value: normalizeRisingValue(rising?.value) });
  }

  return entries;
};

const extractRisingQueryEntriesFromNormalizedItem = (item: ExploreItem): RisingQueryEntry[] => {
  if (isQueryListExploreItem(item)) {
    return extractRisingQueryEntriesFromQueryList(item);
  }

  if (isTopicListExploreItem(item)) {
    return extractRisingQueryEntriesFromTopicList(item);
  }

  return [];
};

const extractRisingQueryEntriesFromNormalized = (result: unknown): RisingQueryEntry[] => {
  const normalized = normalizeTaskResults(result);
  if (normalized.length === 0) {
    return [];
  }

  const entries: RisingQueryEntry[] = [];

  for (const entry of normalized) {
    for (const resultItem of entry.results) {
      for (const item of resultItem.items) {
        entries.push(...extractRisingQueryEntriesFromNormalizedItem(item));
      }
    }
  }

  return entries;
};

const extractRisingKeywordsFromItem = (item: Record<string, unknown>): string[] => {
  const data = item.data;
  if (!isObject(data)) {
    return [];
  }

  const risingRaw = (data as Record<string, unknown>).rising;

  if (!risingRaw) {
    return [];
  }

  if (Array.isArray(risingRaw)) {
    return extractQueriesFromList(risingRaw);
  }

  if (isObject(risingRaw) && Array.isArray((risingRaw as { topics?: unknown[] }).topics)) {
    return extractQueriesFromList((risingRaw as { topics: unknown[] }).topics);
  }

  return [];
};

const extractRisingQueryEntriesFromItem = (item: Record<string, unknown>): RisingQueryEntry[] => {
  const data = item.data;
  if (!isObject(data)) {
    return [];
  }

  const risingRaw = (data as Record<string, unknown>).rising;

  if (!risingRaw) {
    return [];
  }

  if (Array.isArray(risingRaw)) {
    return extractRisingQueryEntriesFromList(risingRaw);
  }

  if (isObject(risingRaw) && Array.isArray((risingRaw as { topics?: unknown[] }).topics)) {
    return extractRisingQueryEntriesFromList((risingRaw as { topics: unknown[] }).topics);
  }

  return [];
};

export const extractRisingKeywords = (result: unknown): string[] => {
  if (!isObject(result)) {
    return [];
  }

  const items = (result as { items?: unknown[] }).items;

  if (!Array.isArray(items)) {
    return [];
  }

  const keywords: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    keywords.push(...extractRisingKeywordsFromItem(item as Record<string, unknown>));
  }

  return keywords;
};

const extractRisingQueryEntriesLegacy = (result: unknown): RisingQueryEntry[] => {
  if (!isObject(result)) {
    return [];
  }

  const items = (result as { items?: unknown[] }).items;

  if (!Array.isArray(items)) {
    return [];
  }

  const entries: RisingQueryEntry[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    entries.push(...extractRisingQueryEntriesFromItem(item as Record<string, unknown>));
  }

  return entries;
};

export const extractRisingQueryEntries = (result: unknown): RisingQueryEntry[] => {
  const normalizedEntries = extractRisingQueryEntriesFromNormalized(result);
  if (normalizedEntries.length > 0) {
    return normalizedEntries;
  }

  return extractRisingQueryEntriesLegacy(result);
};

export const determineDiscoveryBucket = (timeRange: string | undefined): DiscoveryBucket => {
  if (!timeRange) {
    return "other";
  }

  const normalized = normalizeTimeframe(timeRange.trim().toLowerCase());

  if (normalized.includes("past_day") || normalized.includes("now 1-d") || normalized.includes("now 1d")) {
    return "24h";
  }

  if (normalized.includes("past_3_days") || normalized.includes("now 3-d") || normalized.includes("now 3d")) {
    return "3d";
  }

  if (normalized.includes("past_7_days") || normalized.includes("now 7-d") || normalized.includes("now 7d")) {
    return "7d";
  }

  return "other";
};

export const mapStatusCodeToTaskStatus = (statusCode: number | undefined) => {
  if (typeof statusCode !== "number") {
    return "queued";
  }

  return statusCode >= 40000 ? "error" : "queued";
};

type GraphDataPoint = {
  timestamp?: number;
  value?: number;
  date_from?: string;
  dateFrom?: string;
  date_to?: string;
  dateTo?: string;
};

const toTimestampMs = (point: GraphDataPoint): number | undefined => {
  if (typeof point.timestamp === "number" && Number.isFinite(point.timestamp)) {
    return Math.floor(point.timestamp * 1000);
  }

  const candidate = point.date_from ?? point.dateFrom ?? point.date_to ?? point.dateTo;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    const parsed = Date.parse(candidate.trim());
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const toValue = (point: GraphDataPoint): number | undefined => {
  if (typeof point.value === "number" && Number.isFinite(point.value)) {
    return point.value;
  }

  return undefined;
};

export type KeywordSeriesPoint = {
  timestamp: number;
  value: number;
};

export const extractGraphSeriesForKeyword = (result: unknown, keyword: string): KeywordSeriesPoint[] => {
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedKeyword) {
    return [];
  }

  const normalizedResults = normalizeTaskResults(result);
  if (normalizedResults.length === 0) {
    return [];
  }

  const points: KeywordSeriesPoint[] = [];

  for (const entry of normalizedResults) {
    for (const resultItem of entry.results) {
      for (const item of resultItem.items) {
        if (item.type !== "google_trends_graph") {
          continue;
        }

        const graphItem = item as Extract<ExploreItem, { type: "google_trends_graph" }>;

        const keywords = Array.isArray(graphItem.keywords)
          ? (graphItem.keywords as string[]).map((value) => normalizeKeyword(value))
          : [];

        if (keywords.length > 0 && !keywords.includes(normalizedKeyword)) {
          continue;
        }

        if (!Array.isArray(graphItem.data)) {
          continue;
        }

        for (const rawPoint of graphItem.data as GraphDataPoint[]) {
          const timestamp = toTimestampMs(rawPoint);
          const value = toValue(rawPoint);

          if (timestamp === undefined || value === undefined) {
            continue;
          }

          points.push({ timestamp, value });
        }
      }
    }
  }

  points.sort((a, b) => a.timestamp - b.timestamp);

  return points;
};

export type SpikePriority = "24h" | "72h";

export type SpikeAnalysisResult = {
  qualifies: boolean;
  firstSeenAt?: string;
  lastSeenAt?: string;
  priority?: SpikePriority;
  spikeScore?: number;
  baselineMax?: number;
  recentMax?: number;
  reason?: string;
};

export const analyzeKeywordSpike = (params: {
  result: unknown;
  keyword: string;
  now?: Date;
  windowHours?: number;
  baselineMax?: number;
  minSpike?: number;
  hotWindowHours?: number;
}): SpikeAnalysisResult => {
  const {
    result,
    keyword,
    now = new Date(),
    windowHours = NEW_KEYWORD_WINDOW_HOURS,
    baselineMax = BASELINE_MAX_BEFORE_WINDOW,
    minSpike = MIN_SPIKE_VALUE,
    hotWindowHours = HOT_KEYWORD_WINDOW_HOURS,
  } = params;

  const series = extractGraphSeriesForKeyword(result, keyword);
  if (series.length === 0) {
    return { qualifies: false, reason: "missing_series" };
  }

  const nowMs = now.getTime();
  const windowMs = windowHours * 60 * 60 * 1000;
  const hotWindowMs = hotWindowHours * 60 * 60 * 1000;
  const windowStart = nowMs - windowMs;
  const hotWindowStart = nowMs - hotWindowMs;

  const baselinePoints = series.filter((point) => point.timestamp < windowStart);
  const recentPoints = series.filter((point) => point.timestamp >= windowStart);

  if (recentPoints.length === 0) {
    return { qualifies: false, reason: "no_recent_points" };
  }

  const baselineMaxValue = baselinePoints.length === 0 ? 0 : Math.max(...baselinePoints.map((point) => point.value));
  if (baselinePoints.length > 0 && baselineMaxValue > baselineMax) {
    return { qualifies: false, baselineMax: baselineMaxValue, reason: "baseline_too_high" };
  }

  const recentMaxValue = Math.max(...recentPoints.map((point) => point.value));
  if (recentMaxValue < minSpike) {
    return { qualifies: false, recentMax: recentMaxValue, reason: "spike_too_low" };
  }

  const firstSignificant = recentPoints.find((point) => point.value >= minSpike) ?? recentPoints[0];
  const lastSignificant = [...recentPoints].reverse().find((point) => point.value >= minSpike) ?? recentPoints[recentPoints.length - 1];

  const firstSeenAt = new Date(firstSignificant.timestamp).toISOString();
  const lastSeenAt = new Date(lastSignificant.timestamp).toISOString();
  const priority: SpikePriority = firstSignificant.timestamp >= hotWindowStart ? "24h" : "72h";
  const spikeScore = Number(recentMaxValue.toFixed(2));

  return {
    qualifies: true,
    firstSeenAt,
    lastSeenAt,
    priority,
    spikeScore,
    baselineMax: baselineMaxValue,
    recentMax: recentMaxValue,
  } satisfies SpikeAnalysisResult;
};
