"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

import { updateCandidateStatus } from "@/app/(dashboard)/candidates/actions";
import type { CandidateRow } from "@/types/candidates";

const STATUS_LABEL: Record<string, string> = {
  pending: "待筛选",
  approved: "待查询",
  queued: "已排队",
  rejected: "已忽略",
  expired: "已过期",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-slate-500/10 text-slate-200",
  approved: "bg-emerald-500/10 text-emerald-300",
  queued: "bg-sky-500/10 text-sky-300",
  rejected: "bg-rose-500/10 text-rose-300",
  expired: "bg-zinc-500/10 text-zinc-300",
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

const subtleButtonClass =
  "rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/80 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40";

const paginationSelectClass =
  "rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400";

const formatTime = (value: string | null) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const relative = formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
  return `${date.toLocaleString("zh-CN", { hour12: false })} · ${relative}`;
};

type CandidateGroupCardProps = {
  status: CandidateRow["status"];
  items: CandidateRow[];
};

export const CandidateGroupCard = ({ status, items }: CandidateGroupCardProps) => {
  const label = STATUS_LABEL[status] ?? status;
  const badgeClass = STATUS_STYLE[status] ?? "bg-white/10 text-white/70";
  const total = items.length;

  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(() => (total === 0 ? 1 : Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [total]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [items, currentPage, pageSize]);

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

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <header className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2 py-1 text-xs ${badgeClass}`}>{label}</span>
          <span className="text-sm text-white/60">共 {total} 条</span>
        </div>
        {total > PAGE_SIZE_OPTIONS[0] ? (
          <div className="flex items-center gap-2 text-xs text-white/60">
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
        ) : null}
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm text-white/80">
          <thead className="text-xs uppercase text-white/50">
            <tr>
              <th className="px-3 py-2">词根</th>
              <th className="px-3 py-2">来源</th>
              <th className="px-3 py-2">LLM 判定</th>
              <th className="px-3 py-2">采集时间</th>
              <th className="px-3 py-2">过期时间</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {paginatedItems.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 font-medium text-white">{row.term}</td>
                <td className="px-3 py-2 text-white/70">{row.source}</td>
                <td className="px-3 py-2 text-white/60">
                  {row.llm_label ? (
                    <span>
                      {row.llm_label}
                      {typeof row.llm_score === "number" ? ` · ${row.llm_score.toFixed(2)}` : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                  {row.rejection_reason && row.status === "rejected" ? (
                    <span className="ml-2 text-xs text-rose-300/80">{row.rejection_reason}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-white/60">{formatTime(row.captured_at)}</td>
                <td className="px-3 py-2 text-white/60">{formatTime(row.expires_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <form action={updateCandidateStatus}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        name="status"
                        value="approved"
                        className="rounded-md border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200 transition hover:bg-emerald-500/10"
                        disabled={row.status === "approved" || row.status === "queued"}
                      >
                        标记通过
                      </button>
                    </form>
                    <form action={updateCandidateStatus}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        name="status"
                        value="rejected"
                        className="rounded-md border border-rose-400/40 px-3 py-1 text-xs text-rose-200 transition hover:bg-rose-500/10"
                        disabled={row.status === "rejected"}
                      >
                        忽略
                      </button>
                    </form>
                    {row.status !== "pending" && row.status !== "queued" ? (
                      <form action={updateCandidateStatus}>
                        <input type="hidden" name="id" value={row.id} />
                        <button
                          type="submit"
                          name="status"
                          value="pending"
                          className="rounded-md border border-white/30 px-3 py-1 text-xs text-white/70 transition hover:bg-white/10"
                        >
                          设为待定
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > pageSize ? (
        <div className="mt-4 flex flex-col gap-2 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
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
      ) : null}
    </div>
  );
};

