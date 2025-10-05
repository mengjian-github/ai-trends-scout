import type { TrendKeywordRow } from "@/lib/supabase";

export type HotKeyword = TrendKeywordRow & {
  trend_score?: number | null;
};

export type Hotlist = {
  timeframe: string;
  keywords: HotKeyword[];
};

export type OverviewMetric = {
  id: string;
  label: string;
  value: number | null;
  unit?: string;
  delta?: number | null;
  hint?: string;
};

export type OverviewPayload = {
  generatedAt: string;
  metrics: OverviewMetric[];
  hotlists: Hotlist[];
  alerts: Array<{
    id: string;
    keyword: string;
    locale: string;
    priority: string | null;
    spike_score: number | null;
    triggeredAt: string;
  }>;
};

export type KeywordDetailPayload = {
  keyword: HotKeyword;
  snapshots: Array<{
    collected_at: string;
    trend_score: number | null;
  }>;
  related_news: Array<{
    id: string;
    title: string;
    url: string;
    published_at: string | null;
    source: string | null;
  }>;
};
