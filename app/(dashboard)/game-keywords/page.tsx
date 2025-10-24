export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshGameKeywordsButton } from "@/components/game-keywords/refresh-button";
import { GameKeywordTable } from "@/components/game-keywords/game-keyword-table";
import { FilteredKeywordTable } from "@/components/game-keywords/filtered-keyword-table";
import { getGameKeywordStats, getLatestGameKeywords } from "@/lib/supabase";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }

  return date.toLocaleString("zh-CN", { hour12: false });
};

const GameKeywordsPage = async () => {
  const [acceptedRows, filteredRows, stats] = await Promise.all([
    getLatestGameKeywords({ limit: 500, status: "accepted" }),
    getLatestGameKeywords({ limit: 500, status: "filtered" }),
    getGameKeywordStats(),
  ]);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">游戏关键词库</h2>
          <p className="text-sm text-white/60">
            通过解析各大游戏站点的 sitemap 自动发现热门游戏词，按照首次入库时间倒序展示，便于快速验证 Google Trends 热度。
          </p>
        </div>
        <RefreshGameKeywordsButton />
      </section>

      <section>
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle className="text-base text-white">数据概览</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-white/70 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-white/40">关键词总数</p>
              <p className="mt-1 text-lg font-semibold text-white">{stats.total}</p>
            </div>
            <div>
              <p className="text-xs text-white/40">已入库关键词</p>
              <p className="mt-1 text-lg font-semibold text-emerald-200">{stats.accepted}</p>
            </div>
            <div>
              <p className="text-xs text-white/40">被过滤关键词</p>
              <p className="mt-1 text-lg font-semibold text-rose-200">{stats.filtered}</p>
            </div>
            <div>
              <p className="text-xs text-white/40">最近变动</p>
              <p className="mt-1 text-xs text-white">
                入库：{formatDateTime(stats.lastAcceptedAt)}
                <br />
                过滤：{formatDateTime(stats.lastFilteredAt)}
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-xs text-white/40">操作提示</p>
              <p className="mt-1 text-sm text-white">
                点击词条可在新标签页打开 Google Trends；原始链接指向对应的游戏详情页，过滤原因可帮助快速调优抓取规则。
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <GameKeywordTable rows={acceptedRows} title="已入库关键词列表" />
      </section>

      <section>
        <FilteredKeywordTable rows={filteredRows} />
      </section>
    </div>
  );
};

export default GameKeywordsPage;
