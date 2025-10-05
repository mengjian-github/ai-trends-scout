import { addHours, subHours } from "date-fns";
import type { OverviewPayload, HotKeyword } from "@/types/trends";

const now = new Date();

const randomId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "kw-" + Math.random().toString(16).slice(2, 10);
};

const makeKeyword = (overrides: Partial<HotKeyword>): HotKeyword => {
  const base: HotKeyword = {
    id: randomId(),
    keyword: "sample keyword",
    locale: "us",
    timeframe: "past_7_days",
    demand_category: "tool",
    is_brand: false,
    latest_score: 85,
    latest_ratio: 1.45,
    momentum: 56,
    coverage_countries: ["us", "gb"],
    first_seen: subHours(now, 18).toISOString(),
    last_seen: now.toISOString(),
    summary: "Example summary",
    news_refs: [],
    metadata: {},
    created_at: subHours(now, 20).toISOString(),
    updated_at: now.toISOString(),
  };

  return { ...base, ...overrides };
};

const hotKeywords24h: HotKeyword[] = [
  makeKeyword({ id: "kw-agentic-crm", keyword: "agentic crm", latest_ratio: 1.87, momentum: 63 }),
  makeKeyword({ id: "kw-ai-video-sops", keyword: "ai video sop", locale: "gb", latest_ratio: 1.72, momentum: 41 }),
  makeKeyword({ id: "kw-sales-agent", keyword: "sales agent gpt", locale: "us", latest_ratio: 1.66, momentum: 38 }),
  makeKeyword({ id: "kw-compliance-agent", keyword: "compliance ai agent", locale: "au", latest_ratio: 1.59, momentum: 32 }),
];

const hotKeywords7d: HotKeyword[] = [
  makeKeyword({ id: "kw-prospecting-bot", keyword: "prospecting agent", latest_ratio: 1.94, momentum: 74 }),
  makeKeyword({ id: "kw-ai-sdr", keyword: "ai sdr", locale: "ca", latest_ratio: 1.81, momentum: 58 }),
  makeKeyword({ id: "kw-agent-handoff", keyword: "agent handoff", locale: "de", latest_ratio: 1.65, momentum: 47 }),
  makeKeyword({ id: "kw-agent-playbook", keyword: "agent playbook", locale: "us", latest_ratio: 1.61, momentum: 45 }),
];

export const mockOverviewPayload: OverviewPayload = {
  generatedAt: now.toISOString(),
  metrics: [
    {
      id: "tracked-keywords",
      label: "Tracked keywords",
      value: 62,
      unit: "items",
      delta: 12.5,
      hint: "Count after filters applied",
    },
    {
      id: "active-markets",
      label: "Active markets",
      value: 9,
      delta: 2.3,
      hint: "Developed countries with fresh signals",
    },
    {
      id: "ingestion-latency",
      label: "Ingestion latency",
      value: 8.4,
      unit: "min",
      delta: -1.2,
      hint: "Average delay from fetch to dashboard",
    },
  ],
  hotlists: [
    {
      timeframe: "past_day",
      keywords: hotKeywords24h,
    },
    {
      timeframe: "past_7_days",
      keywords: hotKeywords7d,
    },
  ],
  alerts: [
    {
      id: "alert-agentic-crm",
      keyword: "agentic crm",
      locale: "us",
      ratio: 1.87,
      triggeredAt: addHours(now, -1).toISOString(),
    },
  ],
};
