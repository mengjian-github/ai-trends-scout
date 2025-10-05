import { differenceInMinutes, parseISO } from "date-fns";
import type { OverviewPayload } from "@/types/trends";
import { getRedis, redisKeys } from "@/lib/redis";
import { getLatestKeywords, type TrendKeywordRow } from "@/lib/supabase";
import { trendTimeframes } from "@/lib/env";

type HotlistGroup = {
  timeframe: string;
  keywords: TrendKeywordRow[];
};

const buildOverviewFromSupabase = async (): Promise<OverviewPayload | null> => {
  try {
    const lists = (await Promise.all(
      trendTimeframes.map(async (timeframe) => ({
        timeframe,
        keywords: (await getLatestKeywords({ timeframe, limit: 10 })) as TrendKeywordRow[],
      }))
    )) as HotlistGroup[];

    const flattened = lists.reduce<TrendKeywordRow[]>((acc, item) => {
      acc.push(...item.keywords);
      return acc;
    }, []);

    if (flattened.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        metrics: [],
        hotlists: lists,
        alerts: [],
      };
    }

    const hot24h = flattened.filter((keyword) => keyword.priority === "24h").length;
    const hot72h = flattened.filter((keyword) => keyword.priority === "72h").length;
    const markets = new Set(flattened.map((keyword) => keyword.locale)).size;
    const latestTimestamp = flattened.reduce<string | null>((acc, keyword) => {
      if (!keyword.last_seen) {
        return acc;
      }

      if (!acc) {
        return keyword.last_seen;
      }

      return acc > keyword.last_seen ? acc : keyword.last_seen;
    }, null);

    const latencyMinutes = latestTimestamp ? differenceInMinutes(new Date(), parseISO(latestTimestamp)) : null;

    const metrics = [
      {
        id: "fresh-keywords",
        label: "72 小时内新词",
        value: flattened.length,
        unit: "项",
        delta: null,
        hint: "当前三天内首次出现并通过校验的关键词数量",
      },
      {
        id: "hot-keywords",
        label: "24 小时新增",
        value: hot24h,
        unit: "项",
        delta: null,
        hint: `优先级最高的新词。72 小时窗口内其余新词共 ${hot72h} 项。`,
      },
      {
        id: "active-markets",
        label: "活跃市场数",
        value: markets,
        delta: null,
        hint: "拥有活跃关键词的地区数量",
      },
      {
        id: "ingestion-latency",
        label: "延迟",
        value: latencyMinutes,
        unit: "分钟",
        delta: null,
        hint: "距离最近一次关键词更新的时间",
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      metrics,
      hotlists: lists,
      alerts: [],
    };
  } catch (error) {
    console.error("Failed to build overview from Supabase", error);
    return null;
  }
};

const emptyOverviewPayload: OverviewPayload = {
  generatedAt: new Date().toISOString(),
  metrics: [],
  hotlists: trendTimeframes.map((timeframe) => ({ timeframe, keywords: [] })),
  alerts: [],
};

export const resolveOverviewPayload = async (): Promise<OverviewPayload> => {
  let payload: OverviewPayload | null = null;

  try {
    const redis = getRedis();
    payload = await redis.get<OverviewPayload | null>(redisKeys.overview);
  } catch (error) {
    console.warn("Redis unavailable, falling back", error);
  }

  if (!payload) {
    payload = await buildOverviewFromSupabase();
  }

  if (!payload) {
    return { ...emptyOverviewPayload, generatedAt: new Date().toISOString() };
  }

  if (!payload.hotlists || payload.hotlists.length === 0) {
    payload.hotlists = trendTimeframes.map((timeframe) => ({ timeframe, keywords: [] }));
  }

  return { ...payload, generatedAt: new Date().toISOString() };
};
