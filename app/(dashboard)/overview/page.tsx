export const dynamic = "force-dynamic";

import { resolveOverviewPayload } from "@/lib/services/overview";
import { cn, formatNumber } from "@/lib/utils";
import { MetricsGrid } from "@/components/metrics-grid";
import { HotlistTable } from "@/components/hotlist-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const hotlistTitleMap: Record<string, string> = {
  "now%201%2Bd": "24 小时新词",
  "now%207-d": "7 天新词",
  past_7_days: "过去 7 天新词",
  past_30_days: "过去 30 天新词",
};

const alertPriorityLabel: Record<string, string> = {
  "24h": "24 小时",
  "72h": "72 小时",
};

const OverviewPage = async () => {
  const overview = await resolveOverviewPayload();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">实时总览</h2>
            <p className="text-sm text-white/60">生成时间 {new Date(overview.generatedAt).toLocaleString("zh-CN")}</p>
          </div>
        </div>
        <p className="text-sm text-white/50">
          仪表盘只展示最近 72 小时内首次出现的新词，带玫红标签者代表 24 小时内冒头的高优先级词。
        </p>
        <MetricsGrid
          metrics={overview.metrics.map((metric) => ({
            id: metric.id,
            label: metric.label,
            value: metric.value,
            unit: metric.unit,
            delta: metric.delta,
            hint: metric.hint,
          }))}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {overview.hotlists.map((hotlist) => {
          const isFullWidth = hotlist.timeframe === "past_7_days";

          return (
            <div key={hotlist.timeframe} className={cn("min-w-0", isFullWidth && "xl:col-span-2")}>
              <HotlistTable
                title={hotlistTitleMap[hotlist.timeframe] ?? decodeURIComponent(hotlist.timeframe)}
                timeframe={hotlist.timeframe}
                keywords={hotlist.keywords}
              />
            </div>
          );
        })}
      </section>

      <section>
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle className="text-base">通知</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.alerts.length === 0 ? (
              <p className="text-sm text-white/60">最近一段时间内没有触发通知。</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {overview.alerts.map((alert) => (
                  <li key={alert.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                    <div>
                      <p className="font-medium text-white">{alert.keyword}</p>
                      <p className="text-xs text-white/60">
                        地区 {alert.locale.toUpperCase()} · 峰值 {formatNumber(alert.spike_score, { maximumFractionDigits: 2 })}
                        {alert.priority ? ` · 优先级 ${alertPriorityLabel[alert.priority] ?? alert.priority}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-white/50">{new Date(alert.triggeredAt).toLocaleString("zh-CN")}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default OverviewPage;

