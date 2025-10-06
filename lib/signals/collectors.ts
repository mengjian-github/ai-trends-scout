import Parser from "rss-parser";

import type { RawCandidateEntry } from "@/lib/services/candidates";

const PRODUCT_HUNT_FEED = "https://www.producthunt.com/feed";
const ANGELLIST_FEED = "https://angel.co/blog/feed";
const GITHUB_TRENDING_URL = "https://github.com/trending?since=daily";
const TRENDS24_URL = "https://trends24.in/united-states/";

const htmlEntityDecode = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripHtml = (value: string) => htmlEntityDecode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const rssParser = new Parser({ timeout: 10_000 });
const MAX_COLLECTOR_PER_SOURCE = 40;

export type CollectorOutcome = {
  entries: RawCandidateEntry[];
  errors: Array<{ source: string; error: string }>;
  counts: Record<string, number>;
};

const initOutcome = (): CollectorOutcome => ({ entries: [], errors: [], counts: {} });

const pushEntries = (
  outcome: CollectorOutcome,
  source: string,
  entries: RawCandidateEntry[],
  seen: Set<string>,
  capturedAt?: string | null
) => {
  if (!entries.length) {
    return;
  }

  let accepted = 0;
  for (const entry of entries) {
    if (accepted >= MAX_COLLECTOR_PER_SOURCE) {
      break;
    }

    const term = entry.term?.trim();
    if (!term) {
      continue;
    }

    const normalized = term.toLowerCase();
    if (normalized.length < 3 || !/[a-z0-9]/i.test(normalized) || normalized.startsWith("http")) {
      continue;
    }

    const key = `${source}::${normalized}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    outcome.entries.push({
      ...entry,
      term,
      source,
      capturedAt: entry.capturedAt ?? capturedAt ?? null,
    });
    accepted += 1;
  }

  if (accepted > 0) {
    outcome.counts[source] = (outcome.counts[source] ?? 0) + accepted;
  }
};

const collectProductHunt = async (): Promise<RawCandidateEntry[]> => {
  const feed = await rssParser.parseURL(PRODUCT_HUNT_FEED);
  const items = feed.items ?? [];

  return items.slice(0, 25).map((item) => {
    const rawTitle = item.title ?? "";
    const primaryTitle = rawTitle.split(" – ")[0];
    const term = primaryTitle?.split(":")[0]?.trim() ?? rawTitle.trim();
    const summary = item.contentSnippet ?? item.content ?? "";

    return {
      term,
      title: rawTitle,
      summary,
      tags: item.categories ?? [],
      url: item.link ?? null,
      capturedAt: item.isoDate ?? item.pubDate ?? null,
      metadata: {
        feed: "producthunt",
      },
    } satisfies RawCandidateEntry;
  });
};

const collectAngelList = async (): Promise<RawCandidateEntry[]> => {
  const feed = await rssParser.parseURL(ANGELLIST_FEED);
  const items = feed.items ?? [];

  return items.slice(0, 20).map((item) => ({
    term: item.title?.trim() ?? "",
    title: item.title ?? null,
    summary: item.contentSnippet ?? item.content ?? null,
    tags: item.categories ?? [],
    url: item.link ?? null,
    capturedAt: item.isoDate ?? item.pubDate ?? null,
    metadata: {
      feed: "angellist_blog",
    },
  }));
};

const collectGithubTrending = async (): Promise<RawCandidateEntry[]> => {
  const response = await fetch(GITHUB_TRENDING_URL, {
    headers: {
      "User-Agent": "ai-trends-scout/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const articles = html.match(/<article[\s\S]*?<\/article>/g) ?? [];

  return articles.slice(0, 30).map((article) => {
    const repoMatch = article.match(/<h2[^>]*>\s*<a href=\"\/([^\"]+)\"/i);
    const descriptionMatch = article.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const languageMatch = article.match(/<span itemprop=\"programmingLanguage\">([^<]+)<\/span>/i);
    const repoPath = repoMatch?.[1] ?? "";
    const repoName = repoPath.split("/")[1] ?? repoPath;
    const summary = descriptionMatch ? stripHtml(descriptionMatch[1]) : null;
    const language = languageMatch ? stripHtml(languageMatch[1]) : null;

    return {
      term: repoName.trim(),
      title: repoPath,
      summary,
      tags: language ? [language] : [],
      url: repoPath ? `https://github.com/${repoPath}` : null,
      metadata: {
        repo: repoPath,
        source_page: GITHUB_TRENDING_URL,
      },
    } satisfies RawCandidateEntry;
  });
};

const collectTrends24 = async (): Promise<RawCandidateEntry[]> => {
  const response = await fetch(TRENDS24_URL, {
    headers: {
      "User-Agent": "ai-trends-scout/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const matches = html.match(/<a[^>]*class=\"trend-card__list-link[^>]*>([\s\S]*?)<\/a>/g) ?? [];
  const entries: RawCandidateEntry[] = [];

  for (const snippet of matches.slice(0, 40)) {
    const textMatch = snippet.match(/>([\s\S]*?)<\/a>/);
    if (!textMatch) {
      continue;
    }

    const term = stripHtml(textMatch[1]);
    if (!term) {
      continue;
    }

    entries.push({
      term,
      summary: null,
      tags: null,
      url: null,
      metadata: {
        source_page: TRENDS24_URL,
      },
    });
  }

  return entries;
};

export const collectExternalCandidateRoots = async (): Promise<CollectorOutcome> => {
  const outcome = initOutcome();
  const seen = new Set<string>();

  await Promise.allSettled([
    (async () => {
      try {
        const entries = await collectProductHunt();
        pushEntries(outcome, "product_hunt", entries, seen);
      } catch (error) {
        outcome.errors.push({ source: "product_hunt", error: (error as Error).message ?? "unknown" });
      }
    })(),
    (async () => {
      try {
        const entries = await collectGithubTrending();
        pushEntries(outcome, "github_trending", entries, seen);
      } catch (error) {
        outcome.errors.push({ source: "github_trending", error: (error as Error).message ?? "unknown" });
      }
    })(),
    (async () => {
      try {
        const entries = await collectTrends24();
        pushEntries(outcome, "x_trending", entries, seen);
      } catch (error) {
        outcome.errors.push({ source: "x_trending", error: (error as Error).message ?? "unknown" });
      }
    })(),
    (async () => {
      try {
        const entries = await collectAngelList();
        pushEntries(outcome, "angellist", entries, seen);
      } catch (error) {
        outcome.errors.push({ source: "angellist", error: (error as Error).message ?? "unknown" });
      }
    })(),
  ]);

  return outcome;
};
