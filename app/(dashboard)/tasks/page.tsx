export const dynamic = "force-dynamic";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

import { resolveTaskRunList } from "@/lib/services/tasks";
import { formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TriggerRunButton } from "@/components/tasks/trigger-run-button";

const statusStyles: Record<string, string> = {
  queued: "bg-sky-500/10 text-sky-300",
  running: "bg-indigo-500/10 text-indigo-300",
  running_with_errors: "bg-amber-500/10 text-amber-300",
  completed: "bg-emerald-500/10 text-emerald-300",
  completed_with_errors: "bg-orange-500/10 text-orange-300",
  failed: "bg-rose-500/10 text-rose-300",
};

const statusLabels: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  running_with_errors: "运行有错误",
  completed: "已完成",
  completed_with_errors: "完成但有错误",
  failed: "失败",
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("zh-CN", { hour12: false });
};

const extractStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

const formatKeywordsPreview = (keywords: string[]) => {
  if (keywords.length === 0) {
    return "—";
  }

  const preview = keywords.slice(0, 5).join("，");
  return keywords.length > 5 ? `${preview} 等` : preview;
};

const formatUSD = (value: number) =>
  `$${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TaskRunsPage = async () => {
  const runs = await resolveTaskRunList();

  return (
    <div className="space-y-8">
      <section className="flex justify-end">
        <TriggerRunButton />
      </section>

      <section>
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle className="text-base">任务集合</CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-white/60">尚未触发过 DataForSEO 任务。</p>
            ) : (
              <div className="space-y-4">
                {runs.map((run) => {
                  const statusStyle = statusStyles[run.status] ?? "bg-white/10 text-white/80";
                  const statusLabel = statusLabels[run.status] ?? "未知";

                  const timeframes = extractStringArray(run.metadata.timeframes);
                  const markets = extractStringArray(run.metadata.markets);

                  return (
                    <div
                      key={run.id}
                      className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white md:flex-row md:items-center md:justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`rounded-full px-2 py-1 font-medium ${statusStyle}`}>{statusLabel}</span>
                          <span className="text-white/60">触发时间：{formatDateTime(run.triggeredAt)}</span>
                          <span className="text-white/50">
                            {formatDistanceToNow(new Date(run.triggeredAt), {
                              addSuffix: true,
                              locale: zhCN,
                            })}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-white">
                          根关键词数：{formatNumber(run.rootKeywords.length)} · 任务数：{formatNumber(run.taskCounts.total)}
                        </div>
                        <div className="text-xs text-white/60">
                          本次费用：{formatUSD(run.costTotal)} USD
                        </div>
                        <div className="text-xs text-white/60">
                          完成 {formatNumber(run.taskCounts.completed)} · 排队 {formatNumber(run.taskCounts.queued)} · 错误 {formatNumber(run.taskCounts.error)}
                        </div>
                        <div className="text-xs text-white/50">
                          时间范围：{timeframes.length ? timeframes.join("，") : "—"} · 地区：
                          {markets.length ? markets.join("，") : "—"}
                        </div>
                        <div className="text-xs text-white/40">
                          关键词预览：{formatKeywordsPreview(run.rootKeywords)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <Link
                          href={`/tasks/${run.id}`}
                          className="rounded-lg border border-white/20 px-3 py-2 text-white transition hover:border-white/40 hover:bg-white/10"
                        >
                          查看详情
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default TaskRunsPage;
