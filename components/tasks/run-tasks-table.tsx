"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { normalizeKeyword } from "@/lib/trends/utils";
import { formatNumber } from "@/lib/utils";
import type { RunTaskItem } from "@/types/tasks";

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

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[1];

const subtleButtonClass =
  "rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/80 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40";

const paginationSelectClass =
  "rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400";

type DemandAssessment = {
  label: string | null;
  score: number | null;
  summary: string | null;
  reason: string | null;
};

const extractDemandAssessment = (metadata: RunTaskItem["metadata"]): DemandAssessment | null => {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const demand = (metadata as Record<string, unknown>).demand_assessment;
  if (!demand || typeof demand !== "object" || Array.isArray(demand)) {
    return null;
  }

  const { label, score, summary, reason } = demand as {
    label?: unknown;
    score?: unknown;
    summary?: unknown;
    reason?: unknown;
  };

  const summaryText = typeof summary === "string" ? summary.trim() : "";
  const reasonText = typeof reason === "string" ? reason.trim() : "";

  return {
    label: typeof label === "string" ? label : null,
    score: typeof score === "number" && Number.isFinite(score) ? score : null,
    summary: summaryText.length > 0 ? summaryText : null,
    reason: reasonText.length > 0 ? reasonText : null,
  };
};

const renderDemandBadge = (assessment: DemandAssessment | null) => {
  if (!assessment) {
    return null;
  }

  const labelText = (() => {
    if (assessment.label === "tool") {
      return "工具需求";
    }
    if (assessment.label === "non_tool") {
      return "非工具需求";
    }
    if (assessment.label === "unclear") {
      return "待确认";
    }
    return null;
  })();

  if (!labelText) {
    return null;
  }

  const toneClass = assessment.label === "tool"
    ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
    : assessment.label === "non_tool"
    ? "bg-rose-500/10 text-rose-200 border border-rose-500/30"
    : "bg-amber-500/10 text-amber-200 border border-amber-500/30";

  const scoreText = assessment.score !== null ? ` · 可信度 ${assessment.score.toFixed(2)}` : "";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${toneClass}`}>
      {labelText}
      {scoreText}
    </span>
  );
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("zh-CN", { hour12: false });
};

const formatUSD = (value: number) =>
  `$${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type RunTasksTableProps = {
  runId: string;
  tasks: RunTaskItem[];
  recordedKeywords: string[];
};

export const RunTasksTable = ({ runId, tasks, recordedKeywords }: RunTasksTableProps) => {
  const recordedKeywordSet = useMemo(() => {
    if (!recordedKeywords || recordedKeywords.length === 0) {
      return new Set<string>();
    }

    const set = new Set<string>();
    for (const keyword of recordedKeywords) {
      if (typeof keyword !== "string") {
        continue;
      }

      const normalized = normalizeKeyword(keyword);
      if (normalized) {
        set.add(normalized);
      }
    }

    return set;
  }, [recordedKeywords]);

  const sortedTasks = useMemo(() => {
    if (tasks.length === 0) {
      return [] as RunTaskItem[];
    }

    if (recordedKeywordSet.size === 0) {
      return [...tasks];
    }

    const recordedList: RunTaskItem[] = [];
    const others: RunTaskItem[] = [];

    for (const task of tasks) {
      const normalized = normalizeKeyword(task.keyword ?? "");
      if (normalized && recordedKeywordSet.has(normalized)) {
        recordedList.push(task);
      } else {
        others.push(task);
      }
    }

    return [...recordedList, ...others];
  }, [tasks, recordedKeywordSet]);

  const total = sortedTasks.length;
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(() => (total === 0 ? 1 : Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortedTasks]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedTasks.slice(startIndex, startIndex + pageSize);
  }, [sortedTasks, currentPage, pageSize]);

  const handlePageSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSize = Number(event.target.value);
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const firstItemIndex = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItemIndex = Math.min(total, currentPage * pageSize);

  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-white/50">
              <th className="pb-2 pr-4 font-medium">关键词</th>
              <th className="pb-2 pr-4 font-medium">来源</th>
              <th className="pb-2 pr-4 font-medium">地区</th>
              <th className="pb-2 pr-4 font-medium">时间范围</th>
              <th className="pb-2 pr-4 font-medium">状态</th>
              <th className="pb-2 pr-4 font-medium">提交时间</th>
              <th className="pb-2 pr-4 font-medium">完成时间</th>
              <th className="pb-2 pr-4 font-medium">费用 (USD)</th>
              <th className="pb-2 pr-4 font-medium">错误信息</th>
              <th className="pb-2 pr-4 font-medium">详情</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTasks.map((task) => {
              const metadata = task.metadata;
              const normalizedKeyword = normalizeKeyword(task.keyword ?? "");
              const isRecorded = normalizedKeyword ? recordedKeywordSet.has(normalizedKeyword) : false;
              let sourceLabel = "根关键词";
              if (metadata?.source === "rising") {
                sourceLabel = "扩展";
              } else if (metadata?.seed_origin === "news") {
                sourceLabel = "新闻种子";
              }
              const statusStyle = statusStyles[task.status] ?? "bg-white/10 text-white/80";
              const demandAssessment = extractDemandAssessment(metadata);
              const demandBadge = renderDemandBadge(demandAssessment);
              const demandSummary = demandAssessment?.summary ?? null;
              const demandReason = demandAssessment?.reason ?? null;
              const rowClass = `border-b border-white/5 last:border-none${isRecorded ? " bg-emerald-500/5" : ""}`;

              return (
                <tr key={task.taskId} className={rowClass}>
                  <td className="py-3 pr-4 text-white">
                    <div className="font-medium">{task.keyword}</div>
                    {(isRecorded || demandBadge) ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/70">
                        {isRecorded ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-200">
                            新词入库
                          </span>
                        ) : null}
                        {demandBadge}
                      </div>
                    ) : null}
                    {demandSummary ? (
                      <div className="mt-1 text-xs text-white/70">需求意图：{demandSummary}</div>
                    ) : null}
                    {demandReason ? (
                      <div className="mt-1 text-[11px] text-white/50">判定依据：{demandReason}</div>
                    ) : null}
                    {metadata?.root_label ? (
                      <div className="mt-1 text-xs text-white/50">根关键词标签：{metadata.root_label}</div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-white/70">{sourceLabel}</td>
                  <td className="py-3 pr-4 text-white/70">{task.locale?.toUpperCase() || "—"}</td>
                  <td className="py-3 pr-4 text-white/70">{metadata?.time_range ?? decodeURIComponent(task.timeframe)}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusStyle}`}>
                      {statusLabels[task.status] ?? task.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-white/60">{formatDateTime(task.postedAt)}</td>
                  <td className="py-3 pr-4 text-white/60">{formatDateTime(task.completedAt)}</td>
                  <td className="py-3 pr-4 text-white/70">
                    {typeof task.cost === "number" ? formatUSD(task.cost) : "—"}
                  </td>
                  <td className="py-3 pr-4 text-xs text-rose-300">
                    {task.errorMessage ?? (task.status === "error" ? "无详细错误信息" : "—")}
                  </td>
                  <td className="py-3 pr-4 text-xs text-white/70">
                    <Link
                      href={`/tasks/${runId}/${task.taskId}`}
                      className="inline-flex items-center text-xs font-medium text-emerald-300 underline decoration-dotted underline-offset-4 hover:text-emerald-200"
                    >
                      打开详情页
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span>每页显示</span>
          <select className={paginationSelectClass} value={pageSize} onChange={handlePageSizeChange}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span>条</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>
            显示第 {firstItemIndex} - {lastItemIndex} 条（共 {total} 条）
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handlePrevPage} className={subtleButtonClass} disabled={currentPage === 1}>
              上一页
            </button>
            <span>第 {currentPage} / {totalPages} 页</span>
            <button
              type="button"
              onClick={handleNextPage}
              className={subtleButtonClass}
              disabled={currentPage === totalPages}
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
