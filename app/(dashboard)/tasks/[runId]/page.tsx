export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

import { resolveTaskRunDetail } from "@/lib/services/tasks";
import { formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RunTasksTable } from "@/components/tasks/run-tasks-table";

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
  error: "失败",
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

const formatUSD = (value: number) =>
  `$${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const prettyJson = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "—";
  }

  try {
    const text = JSON.stringify(value, null, 2);
    if (text.length > 4000) {
      return `${text.slice(0, 4000)}…`; // 防止内容过长
    }
    return text;
  } catch (error) {
    return "[无法格式化 JSON]";
  }
};

const TaskRunDetailPage = async ({ params }: { params: Promise<{ runId: string }> }) => {
  const { runId } = await params;
  const detail = await resolveTaskRunDetail(runId);
  if (!detail) {
    notFound();
  }

  const { run, tasks } = detail;
  const statusStyle = statusStyles[run.status] ?? "bg-white/10 text-white/80";
  const statusLabel = statusLabels[run.status] ?? "未知";

  const timeframes = extractStringArray(run.metadata.timeframes);
  const markets = extractStringArray(run.metadata.markets);
  const lastCallbackAt = typeof run.metadata.last_callback_at === "string" ? run.metadata.last_callback_at : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tasks" className="text-sm text-white/60 transition hover:text-white">
          ← 返回任务集合
        </Link>
      </div>

      <Card className="bg-black/20">
        <CardHeader>
          <CardTitle className="text-base">任务集合概览</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-white">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className={`rounded-full px-2 py-1 font-medium ${statusStyle}`}>{statusLabel}</span>
            <span className="text-white/60">触发时间：{formatDateTime(run.triggeredAt)}</span>
            <span className="text-white/50">
              {formatDistanceToNow(new Date(run.triggeredAt), { addSuffix: true, locale: zhCN })}
            </span>
            {lastCallbackAt ? (
              <span className="text-white/50">最近回调：{formatDateTime(lastCallbackAt)}</span>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg bg-white/5 p-3 text-xs text-white/60">
              <p>根关键词数量</p>
              <p className="mt-2 text-xl font-semibold text-white">{formatNumber(run.rootKeywords.length)}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3 text-xs text-white/60">
              <p>总任务数</p>
              <p className="mt-2 text-xl font-semibold text-white">{formatNumber(run.taskCounts.total)}</p>
              <p className="mt-1 text-white/50">费用：{formatUSD(run.costTotal)} USD</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3 text-xs text-white/60">
              <p>已完成</p>
              <p className="mt-2 text-xl font-semibold text-white">{formatNumber(run.taskCounts.completed)}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3 text-xs text-white/60">
              <p>错误</p>
              <p className="mt-2 text-xl font-semibold text-white">{formatNumber(run.taskCounts.error)}</p>
            </div>
          </div>

          <div className="rounded-lg bg-white/5 p-4 text-xs text-white/60">
            <p className="font-medium text-white">配置</p>
            <p className="mt-1">时间范围：{timeframes.length ? timeframes.join("，") : "—"}</p>
            <p className="mt-1">地区：{markets.length ? markets.join("，") : "—"}</p>
          </div>

          <div className="rounded-lg bg-white/5 p-4 text-xs text-white/60">
            <p className="font-medium text-white">根关键词列表</p>
            <p className="mt-1 leading-relaxed text-white/70">
              {run.rootKeywords.length === 0 ? "—" : run.rootKeywords.join("，")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-black/20">
        <CardHeader>
          <CardTitle className="text-base">根关键词任务详情</CardTitle>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="text-sm text-white/60">本次集合下暂无任务记录。</p>
          ) : (
            <RunTasksTable runId={run.id} tasks={tasks} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TaskRunDetailPage;
