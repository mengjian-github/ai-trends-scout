"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
};

export const RunTasksTable = ({ runId, tasks }: RunTasksTableProps) => {
  const total = tasks.length;
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(() => (total === 0 ? 1 : Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [tasks]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return tasks.slice(startIndex, startIndex + pageSize);
  }, [tasks, currentPage, pageSize]);

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
              let sourceLabel = "根关键词";
              if (metadata?.source === "rising") {
                sourceLabel = "扩展";
              } else if (metadata?.seed_origin === "news") {
                sourceLabel = "新闻种子";
              }
              const statusStyle = statusStyles[task.status] ?? "bg-white/10 text-white/80";

              return (
                <tr key={task.taskId} className="border-b border-white/5 last:border-none">
                  <td className="py-3 pr-4 text-white">
                    <div className="font-medium">{task.keyword}</div>
                    {metadata?.root_label ? (
                      <div className="text-xs text-white/50">{metadata.root_label}</div>
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

