"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { GameKeywordRow } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFilterReason } from "@/components/game-keywords/filter-reasons";

type FilteredKeywordTableProps = {
  rows: GameKeywordRow[];
};

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
};

export const FilteredKeywordTable = ({ rows }: FilteredKeywordTableProps) => {
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(() => (rows.length === 0 ? 1 : Math.ceil(rows.length / pageSize)), [rows.length, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize]);

  const handlePageSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(event.target.value));
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  const firstItemIndex = rows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItemIndex = Math.min(rows.length, currentPage * pageSize);

  return (
    <Card className="bg-black/15">
      <CardHeader>
        <CardTitle className="text-base text-white">过滤关键词列表</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-white/60">暂未记录被过滤的关键词。</p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm text-white/80">
                <thead className="text-xs uppercase tracking-wide text-white/50">
                  <tr>
                    <th className="pb-2 pr-4 font-medium">排名</th>
                    <th className="pb-2 pr-4 font-medium">关键词</th>
                    <th className="pb-2 pr-4 font-medium">来源站点</th>
                    <th className="pb-2 pr-4 font-medium">过滤原因</th>
                    <th className="pb-2 pr-4 font-medium">规则详情</th>
                    <th className="pb-2 pr-4 font-medium">原始链接</th>
                    <th className="pb-2 pr-4 font-medium">语言</th>
                    <th className="pb-2 pr-4 font-medium">最近刷新</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, index) => {
                    const rank = (currentPage - 1) * pageSize + index + 1;
                    const statusLabel = row.status === "filtered" ? "已过滤" : row.status;
                    return (
                      <tr key={row.id} className="border-b border-white/5 last:border-none">
                        <td className="py-3 pr-4 text-white/60">第{rank}名</td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-white">{row.keyword}</span>
                            <span className="text-xs text-white/40">{row.normalized_keyword}</span>
                            <span className="w-fit rounded-md bg-rose-400/20 px-1.5 py-0.5 text-[10px] text-rose-200">
                              {statusLabel}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-white/70">{row.site_name}</td>
                        <td className="py-3 pr-4 text-white/80">
                          {formatFilterReason(row.filter_reason ?? "unknown")}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="break-words text-xs text-white/50">
                            {row.filter_detail ? row.filter_detail : "—"}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <a
                            href={row.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-words text-xs text-emerald-200 hover:underline"
                          >
                            {row.source_url}
                          </a>
                        </td>
                        <td className="py-3 pr-4 text-white/70 uppercase">{row.lang}</td>
                        <td className="py-3 pr-4 text-white/60">{formatTimestamp(row.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <span>每页显示</span>
                <select
                  className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  value={pageSize}
                  onChange={handlePageSizeChange}
                >
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
                  显示第 {firstItemIndex} - {lastItemIndex} 条（共 {rows.length} 条）
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    className="rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/80 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40"
                    disabled={currentPage === 1}
                  >
                    上一页
                  </button>
                  <span>
                    第 {currentPage} / {totalPages} 页
                  </span>
                  <button
                    type="button"
                    onClick={handleNextPage}
                    className="rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/80 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40"
                    disabled={currentPage === totalPages}
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FilteredKeywordTable;
