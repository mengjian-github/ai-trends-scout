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

export const encodeMetadataTag = (metadata: TaskMetadata) => {
  try {
    return JSON.stringify(metadata);
  } catch (error) {
    console.error("Failed to encode metadata tag", error);
    return undefined;
  }
};

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

export const mapStatusCodeToTaskStatus = (statusCode: number | undefined) => {
  if (typeof statusCode !== "number") {
    return "queued";
  }

  return statusCode >= 40000 ? "error" : "queued";
};
