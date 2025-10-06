import Parser from "rss-parser";

import { newsCandidateMaxPerItem, newsFeedUrls, newsMaxItems } from "@/lib/env";
import { getActiveRoots, getSupabaseAdmin, type TrendRootRow } from "@/lib/supabase";
import type { RawCandidateEntry } from "@/lib/services/candidates";
import type { Database, Json } from "@/types/supabase";
import { NEWS_KEYWORD_WINDOW_HOURS } from "@/lib/trends/constants";
import { normalizeKeyword } from "@/lib/trends/utils";

type RssItem = {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  categories?: string[];
  guid?: string;
  author?: string;
  creator?: string;
};

export type IngestStats = {
  feedsProcessed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ feed: string; error: string }>;
  keywordsDetected: number;
  candidateRoots: RawCandidateEntry[];
};

type CandidateNewsItem = {
  title: string;
  url: string;
  source: string | null;
  summary: string | null;
  publishedAt: string | null;
  keywords: string[];
  metadata: Record<string, unknown>;
};

type NewsInsert = Database["public"]["Tables"]["ai_trends_news"]["Insert"];
type NewsUpdate = Database["public"]["Tables"]["ai_trends_news"]["Update"];

const parser = new Parser<RssItem>({
  timeout: 10_000,
});

const STOPWORDS = new Set<string>([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "have",
  "will",
  "about",
  "after",
  "over",
  "under",
  "between",
  "their",
  "been",
  "being",
  "amid",
  "amidst",
  "因为",
  "关于",
  "以及",
  "我们",
  "他们",
  "是什么",
  "如何",
  "新闻",
  "报道",
]);

type KeywordMatcher = {
  find: (text: string) => string[];
  signalsAi: boolean;
};

const KEYWORD_MATCHERS: KeywordMatcher[] = [
  {
    find: (text) =>
      extractRegexMatches(
        text,
        /(gpt(?:-\d+)?|chatgpt|copilot|claude|gemini|llm|openai|anthropic|mistral|stability ai|perplexity|genai|deepmind)/gi
      ),
    signalsAi: true,
  },
  {
    find: (text) => extractRegexMatches(text, /(人工智能|大模型|生成式ai|生成式人工智能|算法|机器人)/gi),
    signalsAi: true,
  },
  {
    find: (text) => extractRegexMatches(text, /\bai(?:-[\w-]+)?\b/gi),
    signalsAi: true,
  },
  {
    find: (text) =>
      extractRegexMatches(text, /(machine learning|deep learning|computer vision|natural language processing|nlp|robotics|neural networks?)/gi),
    signalsAi: true,
  },
];

const extractRegexMatches = (text: string, pattern: RegExp) => {
  const matches = text.match(pattern);
  if (!matches) {
    return [];
  }
  return matches.map((item) => item.trim()).filter(Boolean);
};

const sanitizeSummary = (value: string | undefined | null) => {
  if (!value) {
    return null;
  }

  return value.replace(/\s+/g, " ").trim().slice(0, 500);
};

const resolvePublishedAt = (item: RssItem, fallback: string) => {
  const candidate = item.isoDate ?? item.pubDate ?? null;
  if (!candidate) {
    return fallback;
  }

  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toISOString();
};

const toHost = (value: string) => {
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const tokenize = (value: string) => {
  const matches = value
    .toLowerCase()
    .match(/[a-zA-Z0-9_#\+\-]{2,}/g);

  if (!matches) {
    return [];
  }

  return matches.filter((token) => !STOPWORDS.has(token)).slice(0, 20);
};

const extractKeywords = (params: {
  item: RssItem;
  title: string;
  summary: string;
  categories: string[];
  rootKeywordSet: Set<string>;
}): { keywords: string[]; keywordCount: number; hasAiSignal: boolean } => {
  const { item, title, summary, categories, rootKeywordSet } = params;

  const text = `${title}\n${summary}`.toLowerCase();
  const keywords = new Set<string>();
  let hasAiSignal = false;

  for (const matcher of KEYWORD_MATCHERS) {
    const matches = matcher.find(text);
    if (matcher.signalsAi && matches.length > 0) {
      hasAiSignal = true;
    }

    for (const match of matches) {
      const normalized = normalizeKeyword(match);
      if (normalized) {
        keywords.add(normalized);
      }
    }
  }

  for (const category of categories) {
    const normalized = normalizeKeyword(category);
    if (normalized) {
      keywords.add(normalized);
    }
  }

  for (const token of tokenize(title)) {
    const normalized = normalizeKeyword(token);
    if (normalized) {
      keywords.add(normalized);
    }
  }

  for (const token of tokenize(summary)) {
    const normalized = normalizeKeyword(token);
    if (normalized) {
      keywords.add(normalized);
    }
  }

  for (const root of rootKeywordSet) {
    if (root && text.includes(root)) {
      keywords.add(root);
    }
  }

  if (item.author) {
    const normalized = normalizeKeyword(item.author);
    if (normalized) {
      keywords.add(normalized);
    }
  }

  if (item.creator) {
    const normalized = normalizeKeyword(item.creator);
    if (normalized) {
      keywords.add(normalized);
    }
  }

  const keywordList = Array.from(keywords)
    .map((keyword) => keyword.slice(0, 120))
    .filter((keyword) => keyword && keyword !== "ai");

  return { keywords: keywordList.slice(0, 16), keywordCount: keywordList.length, hasAiSignal };
};

const DEFAULT_NEWS_WINDOW_MS = NEWS_KEYWORD_WINDOW_HOURS * 60 * 60 * 1000;
const MAX_CANDIDATES_PER_ITEM = newsCandidateMaxPerItem > 0 ? newsCandidateMaxPerItem : 5;
const NEWS_CANDIDATE_EXCLUDES = new Set([
  "ai",
  "人工智能",
  "machine learning",
  "artificial intelligence",
  "news",
  "最新",
  "report",
  "update",
]);

const looksLikeNewsCandidate = (keyword: string) => {
  if (NEWS_CANDIDATE_EXCLUDES.has(keyword)) {
    return false;
  }

  if (keyword.length < 4 || keyword.length > 80) {
    return false;
  }

  if (!/[a-zA-Z0-9]/.test(keyword)) {
    return false;
  }

  return true;
};

export const ingestNewsFeeds = async (): Promise<IngestStats> => {
  const feeds = newsFeedUrls.length > 0 ? newsFeedUrls : [];
  if (feeds.length === 0) {
    return {
      feedsProcessed: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      keywordsDetected: 0,
      candidateRoots: [],
    };
  }

  const client = getSupabaseAdmin();
  const roots: TrendRootRow[] = await getActiveRoots();
  const rootKeywordSet = new Set(
    roots
      .map((root) => normalizeKeyword(root.keyword))
      .filter((value): value is string => Boolean(value))
  );

  const stats: IngestStats = {
    feedsProcessed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    keywordsDetected: 0,
    candidateRoots: [],
  };

  const maxItems = newsMaxItems && Number.isFinite(newsMaxItems) ? newsMaxItems : 60;
  const cutoffMs = Date.now() - DEFAULT_NEWS_WINDOW_MS;
  const seenUrls = new Set<string>();
  const seenCandidateKeywords = new Set<string>();
  const candidates: CandidateNewsItem[] = [];

  for (const feedUrl of feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);
      stats.feedsProcessed += 1;

      const feedTitle = feed.title ?? toHost(feedUrl) ?? "Unknown";

      for (const item of feed.items ?? []) {
        if (candidates.length >= maxItems) {
          break;
        }

        const title = item.title?.trim();
        const link = item.link?.trim();
        if (!title || !link) {
          stats.skipped += 1;
          continue;
        }

        if (seenUrls.has(link)) {
          stats.skipped += 1;
          continue;
        }

        seenUrls.add(link);

        const summary = sanitizeSummary(item.contentSnippet ?? item.content ?? null);
        const fallbackDate = new Date().toISOString();
        const publishedAt = resolvePublishedAt(item, fallbackDate);
        const publishedTime = new Date(publishedAt).getTime();

        if (Number.isFinite(publishedTime) && publishedTime < cutoffMs) {
          stats.skipped += 1;
          continue;
        }

        const { keywords, keywordCount } = extractKeywords({
          item,
          title,
          summary: summary ?? "",
          categories: item.categories ?? [],
          rootKeywordSet,
        });

        if (!keywordCount) {
          stats.skipped += 1;
          continue;
        }

        stats.keywordsDetected += keywordCount;

        const candidateKeywords = Array.from(new Set(keywords)).filter((keyword) =>
          looksLikeNewsCandidate(keyword)
        );

        if (candidateKeywords.length > 0) {
          const selected: string[] = [];
          for (const candidateKeyword of candidateKeywords) {
            const normalizedCandidate = normalizeKeyword(candidateKeyword);
            if (!normalizedCandidate) {
              continue;
            }
            if (rootKeywordSet.has(normalizedCandidate)) {
              continue;
            }
            if (seenCandidateKeywords.has(normalizedCandidate)) {
              continue;
            }

            selected.push(candidateKeyword);
            seenCandidateKeywords.add(normalizedCandidate);

            if (selected.length >= MAX_CANDIDATES_PER_ITEM) {
              break;
            }
          }

          for (const candidateKeyword of selected) {
            stats.candidateRoots.push({
              term: candidateKeyword,
              source: "news_keyword",
              title,
              summary,
              tags: item.categories ?? [],
              url: link,
              capturedAt: publishedAt,
              metadata: {
                news_id: item.guid ?? null,
                feed_url: feedUrl,
              },
            });
          }
        }

        const candidate: CandidateNewsItem = {
          title,
          url: link,
          source: item.creator?.trim() || item.author?.trim() || feedTitle,
          summary,
          publishedAt,
          keywords,
          metadata: {
            feed_url: feedUrl,
            feed_title: feedTitle,
            guid: item.guid ?? null,
            categories: item.categories ?? null,
          },
        };

        candidates.push(candidate);
      }
    } catch (error) {
      stats.errors.push({ feed: feedUrl, error: (error as Error).message ?? "Unknown feed error" });
    }

    if (candidates.length >= maxItems) {
      break;
    }
  }

  if (candidates.length === 0) {
    return stats;
  }

  for (const candidate of candidates) {
    try {
      const existingResponse = await client
        .from("ai_trends_news")
        .select("id")
        .eq("url", candidate.url)
        .maybeSingle();

      const existingRecord = existingResponse.data as { id: string } | null;
      const existingId = existingRecord?.id ?? null;

      if (existingId) {
        const updatePayload: NewsUpdate = {
          title: candidate.title,
          source: candidate.source,
          summary: candidate.summary,
          published_at: candidate.publishedAt,
          keywords: candidate.keywords.length > 0 ? candidate.keywords : null,
          metadata: candidate.metadata as unknown as Json,
        };

        await client
          .from("ai_trends_news")
          // @ts-ignore Supabase typings expect an array payload; single object works at runtime
          .update(updatePayload)
          .eq("id", existingId);

        stats.updated += 1;
        continue;
      }

      const insertPayload: NewsInsert = {
        title: candidate.title,
        url: candidate.url,
        source: candidate.source,
        summary: candidate.summary,
        published_at: candidate.publishedAt,
        keywords: candidate.keywords.length > 0 ? candidate.keywords : null,
        metadata: candidate.metadata as unknown as Json,
      };

      await client
        .from("ai_trends_news")
        // @ts-ignore Supabase typings expect an array payload; single object works at runtime
        .insert(insertPayload);

      stats.inserted += 1;
    } catch (error) {
      stats.errors.push({ feed: candidate.url, error: (error as Error).message ?? "Failed to upsert" });
    }
  }

  return stats;
};
