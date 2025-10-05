export const dynamic = "force-dynamic";

import { getLatestKeywords, type TrendKeywordRow } from "@/lib/supabase";
import { trendTimeframes } from "@/lib/env";
import { HotlistTable } from "@/components/hotlist-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HotlistResult = {
  timeframe: string;
  keywords: TrendKeywordRow[];
};

const titleMap: Record<string, string> = {
  "now%201%2Bd": "24 小时上升关键词",
  "now%207-d": "7 天上升关键词",
  past_7_days: "过去 7 天上升关键词",
  past_30_days: "过去 30 天上升关键词",
};

const KeywordsPage = async () => {
  let lists: HotlistResult[] = [];

  try {
    lists = await Promise.all(
      trendTimeframes.map(async (timeframe) => ({
        timeframe,
        keywords: (await getLatestKeywords({ timeframe, limit: 50 })) as TrendKeywordRow[],
      }))
    );
  } catch (error) {
    console.warn("Supabase not available for keywords page", error);
  }

  if (lists.length === 0) {
    lists = trendTimeframes.map((timeframe) => ({ timeframe, keywords: [] }));
  }

  return (
    <div className="space-y-8">
      <section>
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle>筛选条件</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-white/60 md:grid-cols-2">
            <p>后续版本将提供时间范围、地区、最低比值等动态筛选控件。</p>
            <p>使用 Supabase 保存筛选方案和集合，支撑编辑团队的工作流程。</p>
          </CardContent>
        </Card>
      </section>
      <section className="space-y-6">
        {lists.map((list) => (
          <HotlistTable
            key={list.timeframe}
            title={titleMap[list.timeframe] ?? decodeURIComponent(list.timeframe)}
            timeframe={list.timeframe}
            keywords={list.keywords}
          />
        ))}
      </section>
    </div>
  );
};

export default KeywordsPage;

