export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

import { TaskResultViewer } from "@/components/tasks/task-result-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveTaskRunDetail } from "@/lib/services/tasks";
import { formatNumber } from "@/lib/utils";
import type { TaskMetadata } from "@/types/tasks";

const statusStyles: Record<string, string> = {
  queued: "bg-sky-500/10 text-sky-300",
  running: "bg-indigo-500/10 text-indigo-300",
  running_with_errors: "bg-amber-500/10 text-amber-300",
  completed: "bg-emerald-500/10 text-emerald-300",
  completed_with_errors: "bg-orange-500/10 text-orange-300",
  failed: "bg-rose-500/10 text-rose-300",
  error: "bg-rose-500/10 text-rose-300",
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

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

const RequestSummary = ({ request }: { request?: Record<string, unknown> | null }) => {
  if (!request || Object.keys(request).length === 0) {
    return <p className="text-sm text-white/60">暂无请求参数记录。</p>;
  }

  const keywords = toStringArray(request.keywords);
  const compare = toStringArray(request.compare_keywords ?? request.compare);
  const payloadEntries = Object.entries(request)
    .filter(([key]) => !["keywords", "compare_keywords", "compare"].includes(key))
    .map(([key, value]) => [key, String(value ?? "")] as const);

  return (
    <div className="space-y-4 text-sm text-white/70">
      <div className="rounded-lg border border-white/10 bg-black/30 p-4">
        <p className="text-xs font-medium text-white/80">主要关键词</p>
        <p className="mt-1 text-white">{keywords.length ? keywords.join("，") : "—"}</p>
        {compare.length ? (
          <p className="mt-2 text-xs text-white/60">对比关键词：{compare.join("，")}</p>
        ) : null}
      </div>

      {payloadEntries.length > 0 ? (
        <div className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4 text-xs text-white/60 md:grid-cols-2">
          {payloadEntries.map(([key, value]) => (
            <div key={key} className="flex flex-col">
              <span className="text-white/50">{key}</span>
              <span className="text-white/80">{value || "—"}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const MetadataSummary = ({ metadata }: { metadata?: TaskMetadata }) => {
  if (!metadata) {
    return <p className="text-sm text-white/60">暂无元数据。</p>;
  }

  const entries: Array<[string, string]> = [
    ["来源", metadata.source ?? "—"],
    ["根任务 ID", metadata.root_id ?? "—"],
    ["根关键词标签", metadata.root_label ?? "—"],
    ["根关键词", metadata.root_keyword ?? "—"],
  ];

  if (typeof metadata.baseline === "string" && metadata.baseline.trim().length > 0) {
    entries.push(["基准词", metadata.baseline]);
  }

  entries.push(
    ["地区", metadata.location_name ?? metadata.locale ?? "—"],
    ["语言", metadata.language_name ?? "—"],
    ["时间范围", metadata.time_range ?? "—"],
  );

  if (metadata.parent_keyword) {
    entries.push(["父关键词", metadata.parent_keyword]);
  }

  if (metadata.parent_task_id) {
    entries.push(["父任务 ID", metadata.parent_task_id]);
  }

  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4 text-xs text-white/60 md:grid-cols-2">
      {entries.map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <span className="text-white/50">{label}</span>
          <span className="text-white/80">{value}</span>
        </div>
      ))}
    </div>
  );
};

const formatUSD = (value: number | null | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return `$${formatNumber(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
};

const TaskDetailPage = async ({
  params,
}: {
  params: Promise<{ runId: string; taskId: string }>;
}) => {
  const { runId, taskId } = await params;
  const detail = await resolveTaskRunDetail(runId);
  if (!detail) {
    notFound();
  }

  const task = detail.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    notFound();
  }

  const run = detail.run;
  const statusStyle = statusStyles[task.status] ?? "bg-white/10 text-white/80";
  const statusLabel = statusLabels[task.status] ?? task.status;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm text-white/70">
        <Link href={`/tasks/${runId}`} className="text-white/60 transition hover:text-white">
          ← 返回任务集合
        </Link>
        <span className="text-white/40">/</span>
        <Link href={`/tasks/${runId}`} className="text-white/80 hover:text-white">
          {run.rootKeywords.join("，") || run.id}
        </Link>
        <span className="text-white/40">/</span>
        <span className="text-white">{task.keyword}</span>
      </div>

      <Card className="bg-black/20">
        <CardHeader>
          <CardTitle className="text-base">任务概要</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-white">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className={`rounded-full px-2 py-1 font-medium ${statusStyle}`}>{statusLabel}</span>
            <span className="text-white/60">关键词：{task.keyword}</span>
            <span className="text-white/50">地区：{task.locale?.toUpperCase() || "—"}</span>
            <span className="text-white/50">时间范围：{task.metadata?.time_range ?? decodeURIComponent(task.timeframe)}</span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-white/5 p-3 text-xs text-white/60">
              <p>提交时间</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatDateTime(task.postedAt)}</p>
              <p className="text-[11px] text-white/50">
                {task.postedAt
                  ? formatDistanceToNow(new Date(task.postedAt), { addSuffix: true, locale: zhCN })
                  : ""}
              </p>
            </div>
            <div className="rounded-lg bg-white/5 p-3 text-xs text-white/60">
              <p>完成时间</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatDateTime(task.completedAt)}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-3 text-xs text-white/60">
              <p>费用 (USD)</p>
              <p className="mt-2 text-lg font-semibold text-white">{formatUSD(task.cost)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-black/20">
        <CardHeader>
          <CardTitle className="text-base">任务元数据</CardTitle>
        </CardHeader>
        <CardContent>
          <MetadataSummary metadata={task.metadata} />
        </CardContent>
      </Card>

      <Card className="bg-black/20">
        <CardHeader>
          <CardTitle className="text-base">请求参数</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestSummary request={task.request} />
        </CardContent>
      </Card>

      <Card className="bg-black/20">
        <CardHeader>
          <CardTitle className="text-base">结果解析</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskResultViewer task={task} />
        </CardContent>
      </Card>

      {task.errorMessage ? (
        <Card className="bg-rose-500/10">
          <CardHeader>
            <CardTitle className="text-base text-rose-200">错误信息</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-rose-100">{task.errorMessage}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};

export default TaskDetailPage;
