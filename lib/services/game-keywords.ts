import { XMLParser } from "fast-xml-parser";
import { gunzipSync } from "node:zlib";
import { differenceInMilliseconds } from "date-fns";
import { gameSitemapSources } from "@/lib/env";
import {
  insertTrendEvent,
  upsertGameKeywords,
  type GameKeywordRow,
  type GameKeywordUpsertChunk,
} from "@/lib/supabase";

type RefreshOptions = {
  sources?: string[];
  maxPerSource?: number;
  shouldPersist?: boolean;
};

type AcceptedPreviewItem = {
  keyword: string;
  normalized_keyword: string;
  source_url: string;
  lang: string;
};

type SitePreview = {
  site_name: string;
  total: number;
  items: AcceptedPreviewItem[];
};

type FilteredPreviewItem = {
  keyword: string;
  normalized_keyword: string | null;
  source_url: string;
  reason: string;
  detail?: string;
};

type FilteredSitePreview = {
  site_name: string;
  total: number;
  items: FilteredPreviewItem[];
};

type FilteredRecord = {
  keyword: string;
  normalized: string;
  siteName: string;
  sourceUrl: string;
  lang: string;
  reason: string;
  detail?: string;
};

type RefreshResult = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  sourcesScanned: number;
  processedKeywords: number;
  acceptedCount: number;
  filteredCount: number;
  inserted: number;
  updated: number;
  errors: Array<{ source: string; reason: string }>;
  rows: GameKeywordRow[];
  preview: SitePreview[];
  filteredPreview: FilteredSitePreview[];
};

export type GameKeywordRefreshResult = RefreshResult;

export type GameKeywordProgressUpdate =
  | { type: "start"; totalSources: number }
  | { type: "source:start"; source: string }
  | {
      type: "source:complete";
      source: string;
      totalUrls: number;
      acceptedUrls: number;
      filteredUrls: number;
      durationMs: number;
    }
  | { type: "source:error"; source: string; reason: string }
  | {
      type: "upsert:chunk";
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
    }
  | {
      type: "summary";
      inserted: number;
      updated: number;
      totalAccepted: number;
      totalFiltered: number;
      totalProcessed: number;
    }
  | { type: "complete"; durationMs: number; inserted: number; updated: number; errors: number }
  | { type: "error"; message: string };

type SitemapUrlEntry = {
  loc: string;
  lastmod?: string;
  [key: string]: unknown;
};

const USER_AGENT = "AI-Trends-Scout-GameCrawler/1.0 (+https://ai-trends-scout)";
const MAX_SITEMAP_DEPTH = 2;
const DEFAULT_MAX_PER_SOURCE = 2000;
const MAX_PREVIEW_ITEMS_PER_SITE = 50;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  allowBooleanAttributes: true,
  parseTagValue: true,
});

const ensureArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
};

const fetchXml = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/xml,text/xml,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap (${response.status})`);
  }

  const contentEncoding = response.headers.get("content-encoding") ?? "";
  const contentType = response.headers.get("content-type") ?? "";
  const shouldTryGzip = contentEncoding.includes("gzip") || contentType.includes("gzip") || /\.gz($|\?)/i.test(url);

  if (shouldTryGzip) {
    const buffer = Buffer.from(await response.arrayBuffer());
    try {
      return gunzipSync(buffer).toString("utf-8");
    } catch {
      return buffer.toString("utf-8");
    }
  }

  return await response.text();
};

const loadSitemapUrls = async (
  url: string,
  visited: Set<string>,
  depth: number = 0
): Promise<SitemapUrlEntry[]> => {
  const normalizedUrl = url.trim();
  if (visited.has(normalizedUrl) || depth > MAX_SITEMAP_DEPTH) {
    return [];
  }

  visited.add(normalizedUrl);

  try {
    const xml = await fetchXml(normalizedUrl);
    const doc = parser.parse(xml);

    if (doc?.sitemapindex) {
      const nodes = ensureArray(doc.sitemapindex.sitemap ?? doc.sitemapindex.sitemapindex);
      const results: SitemapUrlEntry[] = [];

      for (const node of nodes) {
        const loc = typeof node?.loc === "string" ? node.loc.trim() : null;
        if (!loc) {
          continue;
        }

        const nested = await loadSitemapUrls(loc, visited, depth + 1);
        results.push(...nested);
      }

      return results;
    }

    if (doc?.urlset) {
      const urls = ensureArray(doc.urlset.url ?? doc.urlset.URL);
      return urls
        .map((entry): SitemapUrlEntry | null => {
          if (!entry) {
            return null;
          }

          const locValue =
            typeof entry.loc === "string"
              ? entry.loc
              : typeof entry.loc === "object" && entry.loc?.text
              ? String(entry.loc.text)
              : null;

          if (!locValue) {
            return null;
          }

          const lastmod =
            typeof entry.lastmod === "string"
              ? entry.lastmod
              : typeof entry.lastmod === "object" && entry.lastmod?.text
              ? String(entry.lastmod.text)
              : undefined;

          return { ...entry, loc: locValue.trim(), lastmod: lastmod?.trim() };
        })
        .filter((item): item is SitemapUrlEntry => Boolean(item?.loc));
    }

    const locMatches = xml.match(/<loc>(.*?)<\/loc>/gi);
    if (locMatches) {
      return locMatches
        .map((match) => match.replace(/<\/?loc>/gi, "").trim())
        .filter((loc) => loc.length > 0)
        .map((loc) => ({ loc }));
    }

    return [];
  } catch (error) {
    throw new Error((error as Error).message ?? "Failed to parse sitemap");
  }
};

const slugToTitle = (slug: string) => {
  const cleaned = slug
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) {
    return null;
  }

  return cleaned
    .split(" ")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower.length === 0) {
        return "";
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
};

const findTitleInNode = (node: unknown, currentKey?: string): string | null => {
  if (!node) {
    return null;
  }

  if (typeof node === "string") {
    const key = currentKey?.toLowerCase() ?? "";
    const trimmed = node.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (key.includes("title") || key.includes("name") || key.includes("headline")) {
      return trimmed;
    }
    return null;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTitleInNode(item, currentKey);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const nested = findTitleInNode(value, key);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
};

const normalizeHost = (host: string): string => host.replace(/^www\./i, "").toLowerCase();

type SiteRule = {
  include?: RegExp[];
  exclude?: RegExp[];
  minSegments?: number;
  allowDotSegment?: boolean;
};

const SITE_RULES: Record<string, SiteRule> = {
  "crazygames.com": { include: [/^\/game\//] },
  "onlinegames.io": {
    include: [/^\/[a-z0-9][a-z0-9\-]*\/?$/i],
    exclude: [
      /^\/(about|privacy|terms|contact|category|categories|tag|tags|blog|news|author|page|dmca|advertise|developers?)/i,
    ],
  },
  "geometrydashlitepc.io": {
    include: [/^\/[a-z0-9][a-z0-9\-]*$/i],
    exclude: [
      /^\/(new(-games)?|hot(-games)?|privacy-policy|terms-of-service|about|contact|dmca|sitemap|categories?|tags?)/i,
    ],
  },
  "geometrygames.io": {
    include: [/^\/[a-z0-9][a-z0-9\-]*$/i],
    exclude: [
      /^\/(top-popular|new-games|hot-games|about-us|contact-us|privacy-policy|terms-of-service|dmca|disclaimer)/i,
      /\.[a-z0-9]+$/i,
    ],
  },
  "geometrygame.org": {
    include: [/^\/[a-z0-9][a-z0-9\-]*$/i],
    exclude: [
      /^\/(new-games|hot-games|privacy-policy|terms-of-service|about|contact|dmca|disclaimer)/i,
    ],
  },
  "geometry-lite.io": {
    include: [/^\/[a-z0-9][a-z0-9\-]*$/i],
    exclude: [
      /^\/(new-games|hot-games|privacy-policy|terms-of-service|about|contact|dmca|disclaimer|categories?|tags?)/i,
    ],
  },
  "agame.com": { include: [/^\/game\//] },
  "gamesgames.com": { include: [/^\/game\//] },
  "freegames.com": { include: [/^\/games?\//] },
  "arkadium.com": { include: [/^\/games\/[^/]+\/?$/] },
  "truckgamesparking.com": { include: [/^\/playgames\/[^/]+\/?$/] },
  "minijuegos.com": { include: [/^\/juego\//] },
  "now.gg": {
    include: [/^\/apps\/[^/]+\/[^/]+\/[^/]+(?:\.[a-z0-9]+)?\/?$/i],
    exclude: [/^\/(sitemap|blog|news|developers?|terms|privacy|company|contact)/i],
    allowDotSegment: true,
  },
  "iogames.onl": {
    include: [/^\/[^/]+\/?$/],
    exclude: [/^\/(category|categories|tags?|about|contact|privacy|terms|sitemap|dmca|blog|news)/i],
  },
  "coolmathgames.com": { include: [/^\/(0-9|[a-z0-9][a-z0-9\-]*)\/?$/i], exclude: [/^\/(about|privacy|terms|contact|blog|news|category|tags?)/i] },
  "friv.com": { include: [/^\/friv-[^/]+\/?$/i], exclude: [/^\/(about|privacy|terms|contact|category|tags?)/i] },
  "armorgames.com": { include: [/^\/play\/\d+\/[^/]+\/?$/] },
  "bloxd.io": { include: [/^\/[^/]+\/?$/], exclude: [/^\/(privacy|terms|contact|about|login|register|account|blog|news)/i] },
  "lagged.com": { include: [/^\/game\/[^/]+\/?$/] },
  "gamemonetize.com": { include: [/^\/[^/]+\/?$/], exclude: [/^\/(privacy|terms|contact|category|tags?|developers?|about|blog|news|sitemap)/i] },
  "gamiary.com": { include: [/^\/[^/]+\/?$/], exclude: [/^\/(privacy|terms|contact|category|tags?|about|dmca|sitemap|blog|news)/i] },
  "crazycattle3d.io": { include: [/^\/[^/]+\/?$/], exclude: [/^\/(privacy|terms|contact|about|dmca|sitemap|categories?|tags?)/i] },
  "minecraft.net": {
    include: [/^\/(en-us|zh-hans)\/[^/]+\/[^/]+\/?$/i],
    exclude: [/^\/[^/]+\/(news|article|category|store|support|community|privacy|terms)/i],
  },
};

const LAST_SEGMENT_EXACT = new Set([
  "",
  "new",
  "new-games",
  "hot",
  "hot-games",
  "top",
  "top-games",
  "best",
  "best-games",
  "popular",
  "popular-games",
  "about",
  "about-us",
  "contact",
  "contact-us",
  "privacy",
  "privacy-policy",
  "terms",
  "terms-of-service",
  "terms-of-use",
  "dmca",
  "disclaimer",
  "sitemap",
  "index",
  "home",
  "games",
  "game",
  "category",
  "categories",
  "tag",
  "tags",
  "blog",
  "news",
  "author",
  "authors",
  "page",
  "pages",
  "login",
  "signup",
  "register",
  "account",
  "developer",
  "developers",
  "team",
  "careers",
  "jobs",
  "press",
  "support",
  "help",
  "faq",
  "playgames",
  "newgames",
  "hotgames",
  "apps",
  "app",
]);

const LAST_SEGMENT_PATTERNS: RegExp[] = [
  /^(new|latest|top|best|popular)(-|$)/,
  /^(category|categories|tag|tags)(-|$)/,
  /^(about|contact|privacy|terms|policy)(-|$)/,
  /^(support|help|faq|blog|news)(-|$)/,
  /^(page|pages|author|authors)(-|$)/,
  /^(download|install|setup)(-|$)/,
];

const entryHasImage = (entry: SitemapUrlEntry) => {
  const keys = Object.keys(entry);
  return keys.some((key) => key.toLowerCase().includes("image"));
};

const slugify = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const ensureNormalizedForStorage = (normalized: string | null | undefined, keyword: string, sourceUrl: string): string => {
  const trimmed = (normalized ?? "").trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  const keywordSlug = slugify(keyword);
  if (keywordSlug.length > 0) {
    return keywordSlug;
  }

  const urlSlug = slugify(sourceUrl);
  if (urlSlug.length > 0) {
    return urlSlug;
  }

  const hashed = Buffer.from(sourceUrl).toString("base64").replace(/[^a-z0-9]+/gi, "").toLowerCase();
  if (hashed.length > 0) {
    return `entry-${hashed.slice(0, 20)}`;
  }

  return `entry-${Date.now().toString(36)}`;
};

const isLikelyUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  return false;
};

type InclusionCheckResult =
  | { include: true }
  | { include: false; reason: string; detail?: string };

const shouldIncludeEntry = (entry: SitemapUrlEntry): InclusionCheckResult => {
  const location = entry.loc;
  if (typeof location !== "string" || location.trim().length === 0) {
    return { include: false, reason: "missing_location" };
  }

  let parsed: URL;
  try {
    parsed = new URL(location);
  } catch {
    return { include: false, reason: "invalid_url", detail: location };
  }

  const host = normalizeHost(parsed.hostname);
  const rule = SITE_RULES[host];

  const pathname = parsed.pathname || "/";
  if (pathname === "/" || pathname.trim().length === 0) {
    return { include: false, reason: "root_path", detail: pathname };
  }

  if (rule?.exclude) {
    const matched = rule.exclude.find((regex) => regex.test(pathname));
    if (matched) {
      return { include: false, reason: "excluded_by_rule", detail: matched.toString() };
    }
  }

  if (rule?.include && !rule.include.some((regex) => regex.test(pathname))) {
    return {
      include: false,
      reason: "not_matched_by_include_rule",
      detail: rule.include.map((regex) => regex.toString()).join(", "),
    };
  }

  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length < (rule?.minSegments ?? 1)) {
    return {
      include: false,
      reason: "insufficient_path_segments",
      detail: `segments=${segments.length}, required=${rule?.minSegments ?? 1}`,
    };
  }

  const lastSegmentRaw = segments[segments.length - 1];
  const decodedLastSegment = decodeURIComponent(lastSegmentRaw).toLowerCase();

  if (LAST_SEGMENT_EXACT.has(decodedLastSegment)) {
    return { include: false, reason: "last_segment_blocked_exact", detail: decodedLastSegment };
  }

  if (LAST_SEGMENT_PATTERNS.some((regex) => regex.test(decodedLastSegment))) {
    const matchedPattern = LAST_SEGMENT_PATTERNS.find((regex) => regex.test(decodedLastSegment));
    return {
      include: false,
      reason: "last_segment_blocked_pattern",
      detail: `${decodedLastSegment} · ${matchedPattern?.toString()}`,
    };
  }

  if (/^[0-9]+$/.test(decodedLastSegment)) {
    return { include: false, reason: "numeric_last_segment", detail: decodedLastSegment };
  }

  if (decodedLastSegment.length < 3) {
    return { include: false, reason: "last_segment_too_short", detail: decodedLastSegment };
  }

  if (decodedLastSegment.length > 120) {
    return {
      include: false,
      reason: "last_segment_too_long",
      detail: `length=${decodedLastSegment.length}`,
    };
  }

  if (decodedLastSegment.includes(".") && !(rule?.allowDotSegment ?? false)) {
    return { include: false, reason: "last_segment_contains_dot", detail: decodedLastSegment };
  }

  const hasMedia = entryHasImage(entry);
  if (!hasMedia && segments.length <= 1 && !(rule?.include && rule.include.length > 0)) {
    return {
      include: false,
      reason: "shallow_path_without_media",
      detail: `segments=${segments.length}, hasMedia=${hasMedia}`,
    };
  }

  return { include: true };
};

const extractKeywordDetails = (entry: SitemapUrlEntry, siteName: string): { keyword: string; normalized: string } => {
  const titleFromNode = findTitleInNode(entry);
  let slugCandidate = "";

  try {
    const url = new URL(entry.loc);
    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    if (segments.length > 0) {
      slugCandidate = decodeURIComponent(segments[segments.length - 1]);
    }

    if (!slugCandidate && segments.length > 1) {
      slugCandidate = decodeURIComponent(segments[segments.length - 2]);
    }

    if (!slugCandidate) {
      slugCandidate = url.hostname.replace(/^www\./i, "");
    }
  } catch {
    slugCandidate = entry.loc;
  }

  const trimmedSlug = slugCandidate.replace(/\.[a-z0-9]+$/i, "");
  const normalized = slugify(trimmedSlug);

  let keyword = titleFromNode && titleFromNode.length > 1 ? titleFromNode.trim() : null;
  if (keyword) {
    const loc = typeof entry.loc === "string" ? entry.loc.trim() : "";
    if (
      isLikelyUrl(keyword) ||
      (loc.length > 0 && keyword.toLowerCase() === loc.toLowerCase())
    ) {
      keyword = null;
    }
  }

  if (!keyword || keyword.length < 2) {
    keyword = slugToTitle(slugCandidate) ?? slugCandidate;
  }

  if (!keyword || keyword.trim().length === 0) {
    keyword = siteName;
  }

  const cleanedKeyword = keyword.trim();
  const fallbackNormalized = normalized || slugify(cleanedKeyword);
  return {
    keyword: cleanedKeyword,
    normalized: fallbackNormalized,
  };
};

const detectLanguage = (value: string): string => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    if (host.endsWith(".fr")) return "fr";
    if (host.endsWith(".de")) return "de";
    if (host.endsWith(".it")) return "it";
    if (host.endsWith(".es")) return "es";
    if (host.endsWith(".jp") || host.includes("japan")) return "ja";
    if (host.endsWith(".kr")) return "ko";

    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    for (const segment of segments) {
      if (/^[a-z]{2}(-[a-z]{2})?$/i.test(segment)) {
        return segment.toLowerCase();
      }
    }

    return "unknown";
  } catch {
    return "unknown";
  }
};

const buildSiteName = (value: string): string => {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return value;
  }
};

export const refreshGameKeywords = async (
  options: RefreshOptions = {},
  onProgress?: (update: GameKeywordProgressUpdate) => void
): Promise<RefreshResult> => {
  const startedAt = new Date();
  const sources = options.sources ?? gameSitemapSources;
  const maxPerSource = options.maxPerSource ?? DEFAULT_MAX_PER_SOURCE;

  const visited = new Set<string>();
  const dedupe = new Map<string, { keyword: string; normalized: string; sourceUrl: string; siteName: string; lang: string }>();
  const acceptedPreviewMap = new Map<string, { total: number; items: AcceptedPreviewItem[] }>();
  const filteredPreviewMap = new Map<string, { total: number; items: FilteredPreviewItem[] }>();
  const filteredRecordsStorage = new Map<string, FilteredRecord>();
  const errors: Array<{ source: string; reason: string }> = [];
  let totalAccepted = 0;
  let totalProcessed = 0;

  const ensurePreviewBucket = <T>(
    map: Map<string, { total: number; items: T[] }>,
    siteName: string
  ): { total: number; items: T[] } => {
    const key = siteName.trim() || "unknown";
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { total: 0, items: [] };
      map.set(key, bucket);
    }
    return bucket;
  };

  const recordAcceptedPreview = (siteName: string, item: AcceptedPreviewItem) => {
    const bucket = ensurePreviewBucket(acceptedPreviewMap, siteName);
    bucket.total += 1;
    if (bucket.items.length < MAX_PREVIEW_ITEMS_PER_SITE) {
      bucket.items.push(item);
    }
  };

  const recordFilteredPreview = (siteName: string, item: FilteredPreviewItem) => {
    const bucket = ensurePreviewBucket(filteredPreviewMap, siteName);
    bucket.total += 1;
    if (bucket.items.length < MAX_PREVIEW_ITEMS_PER_SITE) {
      bucket.items.push(item);
    }
  };

  onProgress?.({ type: "start", totalSources: sources.length });

  for (const source of sources) {
    try {
      onProgress?.({ type: "source:start", source });
      const sourceStarted = new Date();
      const entries = await loadSitemapUrls(source, visited);
      let acceptedForSource = 0;
      let processedForSource = 0;

      for (const entry of entries) {
        processedForSource += 1;

        const rawLocation = typeof entry?.loc === "string" ? entry.loc.trim() : "";
        const rawSiteName = rawLocation ? buildSiteName(rawLocation) : "";
        const siteName = rawSiteName.trim() || "unknown";
        const lang = rawLocation ? detectLanguage(rawLocation) : "unknown";

        const pushFilteredRecord = (payload: {
          keyword: string;
          normalized?: string | null;
          sourceUrl?: string;
          reason: string;
          detail?: string;
        }) => {
          recordFilteredPreview(siteName, {
            keyword: payload.keyword,
            normalized_keyword: payload.normalized ?? null,
            source_url: payload.sourceUrl ?? "",
            reason: payload.reason,
            detail: payload.detail,
          });

          if (!payload.sourceUrl) {
            return;
          }

          const normalizedForStorage = ensureNormalizedForStorage(payload.normalized ?? "", payload.keyword, payload.sourceUrl);
          const key = `${siteName}::${normalizedForStorage}`;

          if (dedupe.has(key) && payload.reason === "duplicate_keyword") {
            return;
          }

          filteredRecordsStorage.set(key, {
            keyword: payload.keyword,
            normalized: normalizedForStorage,
            siteName,
            sourceUrl: payload.sourceUrl,
            lang,
            reason: payload.reason,
            detail: payload.detail,
          });
        };

        const inclusion = shouldIncludeEntry(entry);
        if (!inclusion.include) {
          if (rawLocation) {
            const details = extractKeywordDetails(entry, siteName);
            pushFilteredRecord({
              keyword: details.keyword,
              normalized: details.normalized,
              sourceUrl: rawLocation,
              reason: inclusion.reason,
              detail: inclusion.detail,
            });
          } else {
            pushFilteredRecord({
              keyword: "（缺少链接）",
              reason: inclusion.reason,
              detail: inclusion.detail,
            });
          }
          continue;
        }

        if (!rawLocation) {
          pushFilteredRecord({
            keyword: "（缺少链接）",
            reason: "missing_location",
          });
          continue;
        }

        const details = extractKeywordDetails(entry, siteName);
        const normalizedForStorage = ensureNormalizedForStorage(details.normalized, details.keyword, rawLocation);

        if (!details.normalized || details.normalized.trim().length === 0) {
          pushFilteredRecord({
            keyword: details.keyword,
            normalized: normalizedForStorage,
            sourceUrl: rawLocation,
            reason: "normalized_empty",
            detail: `slug=${details.keyword}`,
          });
          continue;
        }

        if (normalizedForStorage.length < 2) {
          pushFilteredRecord({
            keyword: details.keyword,
            normalized: normalizedForStorage,
            sourceUrl: rawLocation,
            reason: "normalized_too_short",
            detail: `length=${normalizedForStorage.length}`,
          });
          continue;
        }

        if (normalizedForStorage.length > 160) {
          pushFilteredRecord({
            keyword: details.keyword,
            normalized: normalizedForStorage,
            sourceUrl: rawLocation,
            reason: "normalized_too_long",
            detail: `length=${normalizedForStorage.length}`,
          });
          continue;
        }

        const key = `${siteName}::${normalizedForStorage}`;
        if (dedupe.has(key)) {
          pushFilteredRecord({
            keyword: details.keyword,
            normalized: normalizedForStorage,
            sourceUrl: rawLocation,
            reason: "duplicate_keyword",
            detail: key,
          });
          continue;
        }

        dedupe.set(key, {
          keyword: details.keyword,
          normalized: normalizedForStorage,
          sourceUrl: rawLocation,
          siteName,
          lang,
        });

        recordAcceptedPreview(siteName, {
          keyword: details.keyword,
          normalized_keyword: normalizedForStorage,
          source_url: rawLocation,
          lang,
        });

        acceptedForSource += 1;

        if (acceptedForSource >= maxPerSource) {
          break;
        }
      }

      totalAccepted += acceptedForSource;
      totalProcessed += processedForSource;

      onProgress?.({
        type: "source:complete",
        source,
        totalUrls: processedForSource,
        acceptedUrls: acceptedForSource,
        filteredUrls: processedForSource - acceptedForSource,
        durationMs: differenceInMilliseconds(new Date(), sourceStarted),
      });
    } catch (error) {
      const reason = (error as Error).message ?? "Unknown error";
      errors.push({ source, reason });
      console.error("[game-refresh] 抓取失败", {
        source,
        reason,
        stack: (error as Error).stack,
      });
      onProgress?.({ type: "source:error", source, reason });
      await insertTrendEvent("game_sitemap_error", { source, reason }).catch(() => undefined);
    }
  }

  const acceptedRecords = Array.from(dedupe.values());
  const filteredRecords = Array.from(filteredRecordsStorage.values());

  const acceptedPayload = acceptedRecords.map((item) => ({
    keyword: item.keyword,
    normalized_keyword: item.normalized,
    site_name: item.siteName,
    source_url: item.sourceUrl,
    lang: item.lang,
    last_seen_url: item.sourceUrl,
    status: "accepted" as const,
    filter_reason: null,
    filter_detail: null,
  }));

  const filteredPayload = filteredRecords
    .filter((item) => !dedupe.has(`${item.siteName}::${item.normalized}`))
    .map((item) => ({
      keyword: item.keyword,
      normalized_keyword: item.normalized,
      site_name: item.siteName,
      source_url: item.sourceUrl,
      lang: item.lang,
      last_seen_url: item.sourceUrl,
      status: "filtered" as const,
      filter_reason: item.reason,
      filter_detail: item.detail ?? null,
    }));

  const payload = [...acceptedPayload, ...filteredPayload];
  const acceptedCount = acceptedPayload.length;
  const filteredCount = filteredPayload.length;

  const preview = Array.from(acceptedPreviewMap.entries()).map(([siteName, data]) => ({
    site_name: siteName,
    total: data.total,
    items: data.items,
  }));

  const filteredPreview = Array.from(filteredPreviewMap.entries()).map(([siteName, data]) => ({
    site_name: siteName,
    total: data.total,
    items: data.items,
  }));

  const totalFiltered = Math.max(totalProcessed - totalAccepted, 0);

  let inserted = 0;
  let updated = 0;
  let rows: GameKeywordRow[] = [];

  if (options.shouldPersist) {
    try {
      const result = await upsertGameKeywords(payload, (chunk) => {
        onProgress?.({
          type: "upsert:chunk",
          index: chunk.index,
          total: chunk.total,
          chunkSize: chunk.chunkSize,
          inserted: chunk.inserted,
          updated: chunk.updated,
          error: chunk.error,
        });
      });
      inserted = result.inserted;
      updated = result.updated;
      rows = result.rows;
    } catch (error) {
      const reason = (error as Error).message ?? "Unknown error";
      console.error("[game-refresh] 入库失败", {
        reason,
        stack: (error as Error).stack,
        payloadSize: payload.length,
        totalAccepted,
        totalProcessed,
      });
      onProgress?.({
        type: "error",
        message: reason,
      });
      throw error;
    }
  } else {
    onProgress?.({
      type: "upsert:chunk",
      index: 0,
      total: 0,
      chunkSize: 0,
      inserted: 0,
      updated: 0,
    });
  }

  onProgress?.({
    type: "summary",
    inserted,
    updated,
    totalAccepted,
    totalFiltered,
    totalProcessed,
  });

  const completedAt = new Date();
  const durationMs = differenceInMilliseconds(completedAt, startedAt);
  onProgress?.({ type: "complete", durationMs, inserted, updated, errors: errors.length });

  return {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    sourcesScanned: sources.length,
    processedKeywords: payload.length,
    acceptedCount,
    filteredCount,
    inserted,
    updated,
    errors,
    rows,
    preview,
    filteredPreview,
  };
};
