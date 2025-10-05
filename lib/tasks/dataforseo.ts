import { formatISO } from "date-fns";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return undefined;
};

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const toBoolean = (value: unknown): boolean => value === true;

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

const averageNumbers = (values: number[]): number | undefined => {
  if (values.length === 0) {
    return undefined;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
};

const extractNumericValues = (value: unknown): number[] => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? [] : [parsed];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractNumericValues(item));
  }

  if (isObject(value) && "value" in value) {
    return extractNumericValues((value as Record<string, unknown>).value);
  }

  return [];
};

const toUnixSeconds = (value: unknown): number | undefined => {
  const timestamp = toNumberOrUndefined(value);
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return timestamp;
  }

  const dateString = toStringOrUndefined(value);
  if (dateString) {
    const parsed = Date.parse(dateString);
    if (!Number.isNaN(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return undefined;
};

export type ExploreGraphPoint = {
  timestamp: number;
  value: number;
  dateFrom?: string;
  dateTo?: string;
  missing?: boolean;
};

export type ExploreMapEntry = {
  geoId?: string;
  geoName?: string;
  value?: number;
  maxValueIndex?: number;
};

export type ExploreRankedTopic = {
  id?: string;
  title?: string;
  type?: string;
  value?: number;
};

export type ExploreRankedQuery = {
  query?: string;
  value?: number;
};

export type ExploreItem =
  | {
      type: "google_trends_graph";
      title?: string;
      position?: number;
      keywords: string[];
      data: ExploreGraphPoint[];
      averages: Record<string, number | undefined>;
    }
  | {
      type: "google_trends_map";
      title?: string;
      position?: number;
      keywords: string[];
      data: ExploreMapEntry[];
    }
  | {
      type: "google_trends_topics_list";
      title?: string;
      position?: number;
      keywords: string[];
      top: ExploreRankedTopic[];
      rising: ExploreRankedTopic[];
    }
  | {
      type: "google_trends_queries_list";
      title?: string;
      position?: number;
      keywords: string[];
      top: ExploreRankedQuery[];
      rising: ExploreRankedQuery[];
    }
  | {
      type: string;
      title?: string;
      position?: number;
      keywords: string[];
      raw: unknown;
    };

export type ExploreResult = {
  keywords: string[];
  locationCode?: number;
  languageCode?: string;
  checkUrl?: string;
  datetime?: string;
  itemsCount?: number;
  items: ExploreItem[];
};

export type TaskResultMeta = {
  id?: string;
  statusCode?: number;
  statusMessage?: string;
  cost?: number;
  time?: string;
  resultCount?: number;
  path?: string[];
};

export type NormalizedTaskResult = {
  meta: TaskResultMeta;
  results: ExploreResult[];
};

const parseGraphPoints = (value: unknown): ExploreGraphPoint[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isObject(item)) {
        return undefined;
      }

      const dateFrom = toStringOrUndefined(item.date_from);
      const dateTo = toStringOrUndefined(item.date_to);
      const timestamp = toUnixSeconds(item.timestamp ?? dateFrom ?? dateTo);
      const values = extractNumericValues(item.values);
      const valueNumber = averageNumbers(values);

      if (timestamp === undefined || valueNumber === undefined) {
        return undefined;
      }

      return {
        timestamp,
        value: valueNumber,
        dateFrom,
        dateTo,
        missing: toBoolean(item.missing_data),
      } satisfies ExploreGraphPoint;
    })
    .filter((point): point is ExploreGraphPoint => Boolean(point));
};

const parseGraphAverages = (value: unknown): Record<string, number | undefined> => {
  if (!Array.isArray(value)) {
    return {};
  }

  const entries: Array<[string, number | undefined]> = value.map((item, index) => {
    if (!isObject(item)) {
      return [`系列 ${index + 1}`, undefined];
    }

    const keyword =
      toStringOrUndefined(item.keyword ?? item.topic_title ?? item.term ?? undefined) ?? `系列 ${index + 1}`;
    const averageValue = averageNumbers(extractNumericValues(item.value ?? item.average ?? item));
    return [keyword, averageValue];
  });

  return Object.fromEntries(entries);
};

const parseMapEntries = (value: unknown): ExploreMapEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isObject(item)) {
        return undefined;
      }

      const values = extractNumericValues(item.values);
      const geoId = toStringOrUndefined(item.geo_id);
      const geoName = toStringOrUndefined(item.geo_name);

      if (!geoId && !geoName && values.length === 0) {
        return undefined;
      }

      return {
        geoId,
        geoName,
        value: averageNumbers(values),
        maxValueIndex: toNumberOrUndefined(item.max_value_index),
      } satisfies ExploreMapEntry;
    })
    .filter((entry): entry is ExploreMapEntry => Boolean(entry));
};

const parseTopicEntries = (value: unknown): ExploreRankedTopic[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isObject(item)) {
        return undefined;
      }

      const title = toStringOrUndefined(item.topic_title ?? item.title);
      const type = toStringOrUndefined(item.topic_type ?? item.type);
      const topicId = toStringOrUndefined(item.topic_id);
      const valueNumber = averageNumbers(extractNumericValues(item.value));

      if (!title && valueNumber === undefined) {
        return undefined;
      }

      return {
        id: topicId,
        title: title ?? type,
        type: type,
        value: valueNumber,
      } satisfies ExploreRankedTopic;
    })
    .filter((entry): entry is ExploreRankedTopic => Boolean(entry));
};

const parseQueryEntries = (value: unknown): ExploreRankedQuery[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isObject(item)) {
        return undefined;
      }

      const query = toStringOrUndefined(item.query ?? item.keyword ?? item.term);
      const valueNumber = averageNumbers(extractNumericValues(item.value));

      if (!query && valueNumber === undefined) {
        return undefined;
      }

      return {
        query: query ?? undefined,
        value: valueNumber,
      } satisfies ExploreRankedQuery;
    })
    .filter((entry): entry is ExploreRankedQuery => Boolean(entry));
};

const parseExploreItem = (value: unknown): ExploreItem => {
  if (!isObject(value)) {
    return {
      type: "unknown",
      keywords: [],
      raw: value,
    };
  }

  const type = toStringOrUndefined(value.type) ?? "unknown";
  const title = toStringOrUndefined(value.title);
  const position = toNumberOrUndefined(value.position);
  const keywords = toStringArray(value.keywords);

  if (type === "google_trends_graph") {
    return {
      type,
      title,
      position,
      keywords,
      data: parseGraphPoints(value.data),
      averages: parseGraphAverages(value.averages),
    };
  }

  if (type === "google_trends_map") {
    return {
      type,
      title,
      position,
      keywords,
      data: parseMapEntries(value.data),
    };
  }

  if (type === "google_trends_topics_list") {
    return {
      type,
      title,
      position,
      keywords,
      top: parseTopicEntries(value.data?.top),
      rising: parseTopicEntries(value.data?.rising),
    };
  }

  if (type === "google_trends_queries_list") {
    return {
      type,
      title,
      position,
      keywords,
      top: parseQueryEntries(value.data?.top),
      rising: parseQueryEntries(value.data?.rising),
    };
  }

  return {
    type,
    title,
    position,
    keywords,
    raw: value,
  };
};

const parseExploreResult = (value: unknown): ExploreResult | undefined => {
  if (!isObject(value)) {
    return undefined;
  }

  const keywords = toStringArray(value.keywords);
  const locationCode = toNumberOrUndefined(value.location_code);
  const languageCode = toStringOrUndefined(value.language_code);
  const checkUrl = toStringOrUndefined(value.check_url);
  const datetime = (() => {
    const raw = toStringOrUndefined(value.datetime);
    if (!raw) {
      return undefined;
    }

    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      return raw;
    }

    return formatISO(parsed);
  })();
  const itemsCount = toNumberOrUndefined(value.items_count);
  const items = Array.isArray(value.items) ? value.items.map(parseExploreItem) : [];

  return {
    keywords,
    locationCode,
    languageCode,
    checkUrl,
    datetime,
    itemsCount,
    items,
  } satisfies ExploreResult;
};

const parseTaskResult = (value: unknown): NormalizedTaskResult | undefined => {
  if (!isObject(value)) {
    return undefined;
  }

  const meta: TaskResultMeta = {
    id: toStringOrUndefined(value.id),
    statusCode: toNumberOrUndefined(value.status_code),
    statusMessage: toStringOrUndefined(value.status_message),
    cost: toNumberOrUndefined(value.cost),
    time: toStringOrUndefined(value.time),
    resultCount: toNumberOrUndefined(value.result_count),
    path: Array.isArray(value.path) ? value.path.map((item) => String(item)) : undefined,
  };

  const resultsRaw = (() => {
    if (Array.isArray(value.result)) {
      return value.result;
    }

    if (Array.isArray(value.tasks)) {
      return value.tasks.flatMap((item) => (isObject(item) ? item.result ?? [] : []));
    }

    return undefined;
  })();

  const results = Array.isArray(resultsRaw)
    ? resultsRaw
        .map((item) => parseExploreResult(item))
        .filter((item): item is ExploreResult => Boolean(item))
    : [];

  return {
    meta,
    results,
  } satisfies NormalizedTaskResult;
};

const extractTaskResults = (value: unknown): NormalizedTaskResult[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    const parsed = value
      .map((item) => {
        if (isObject(item) && (Array.isArray(item.result) || Array.isArray(item.tasks))) {
          return parseTaskResult(item);
        }

        if (isObject(item) && !Array.isArray(item.result) && Array.isArray(item.items)) {
          const exploreResult = parseExploreResult(item);
          if (!exploreResult) {
            return undefined;
          }
          return {
            meta: {},
            results: [exploreResult],
          } satisfies NormalizedTaskResult;
        }

        return undefined;
      })
      .filter((item): item is NormalizedTaskResult => Boolean(item));

    if (parsed.length > 0) {
      return parsed;
    }
  }

  if (isObject(value)) {
    if (Array.isArray(value.tasks)) {
      return extractTaskResults(value.tasks);
    }

    if (Array.isArray(value.result)) {
      const meta: TaskResultMeta = {
        statusCode: toNumberOrUndefined(value.status_code),
        statusMessage: toStringOrUndefined(value.status_message),
        cost: toNumberOrUndefined(value.cost),
        time: toStringOrUndefined(value.time),
        resultCount: toNumberOrUndefined(value.result_count),
      };

      const results = value.result
        .map((item) => parseExploreResult(item))
        .filter((item): item is ExploreResult => Boolean(item));

      return [{ meta, results }];
    }
  }

  return [];
};

export const normalizeTaskResults = (value: unknown): NormalizedTaskResult[] => {
  const parsed = extractTaskResults(value);
  if (parsed.length === 0) {
    return [];
  }

  return parsed;
};
