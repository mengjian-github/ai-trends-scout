import "@/lib/server-proxy";
import { Buffer } from "node:buffer";

import { env } from "./env";

const toBase64 = (value: string) => {
  if (typeof btoa === "function") {
    return btoa(value);
  }

  return Buffer.from(value).toString("base64");
};

export type TrendsTaskPayload = {
  location_name?: string;
  location_code?: number;
  language_name?: string;
  language_code?: string;
  time_range: string;
  keywords: string[];
  category_code?: number;
  compare?: string[];
};

export type TrendsTaskResult = {
  task_id: string;
  path: string;
  result: unknown;
  status_code: number;
  status_message: string;
};

const resolveBaseUrl = () => env.DATAFORSEO_BASE_URL ?? "https://api.dataforseo.com/v3";

const resolveAuthHeader = () => {
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    throw new Error("DataForSEO credentials are not configured");
  }

  return `Basic ${toBase64(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`)}`;
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `DataForSEO request failed: ${response.status} ${response.statusText} - ${text || '<empty body>'}`
    );
  }

  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
};

type DataForSeoRequestInit = RequestInit & { timeoutMs?: number };

const DEFAULT_TIMEOUT_MS = 120_000;

export const dataForSeoFetch = async <T>(
  endpoint: string,
  payload: unknown,
  init?: DataForSeoRequestInit
): Promise<T> => {
  const url = `${resolveBaseUrl()}${endpoint}`;
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...requestInit } = init ?? {};

  const controller = new AbortController();
  const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  const mergedSignal = signal ?? (timeoutId ? controller.signal : undefined);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: resolveAuthHeader(),
        ...requestInit.headers,
      },
      body: JSON.stringify(payload),
      ...requestInit,
      signal: mergedSignal,
    });

    return parseResponse<T>(response);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export type TrendsTaskRequestBody = {
  keywords: string[];
  location_name?: string;
  location_code?: number;
  language_name?: string;
  language_code?: string;
  date_from?: string;
  date_to?: string;
  time_range?: string;
  compare_keywords?: string[];
};

export const createTrendsTasks = (
  keywordGroups: Array<{ keywords: string[]; timeRange: string; locationCode?: number }>
) => {
  return keywordGroups.map((group) => ({
    keywords: [...group.keywords],
    time_range: group.timeRange,
    location_code: group.locationCode,
  }));
};
