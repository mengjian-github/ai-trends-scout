"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import { Card, CardContent } from "@/components/ui/card";
import type { NewsItem } from "@/types/news";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

const subtleButtonClass =
  "rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/80 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40";

const paginationSelectClass =
  "rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400";

type NewsListProps = {
  items: NewsItem[];
};

export const NewsList = ({ items }: NewsListProps) => {
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

  if (total === 0) {
    return (
      <Card className="bg-black/15">
        <CardContent>
          <p className="text-sm text-white/60">暂无新闻内容。连接 RSS、Twitter 或 Webhook 来源即可开始填充。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {paginatedItems.map((item) => (
          <Card key={item.id} className="bg-black/15">
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-base font-semibold text-white hover:underline"
                >
                  {item.title}
                </a>
                <span className="text-xs text-white/50">{item.source ?? "来源未知"}</span>
              </div>
              {item.summary ? <p className="text-sm text-white/60">{item.summary}</p> : null}
              <p className="text-xs text-white/40">
                发布时间：{item.published_at ? new Date(item.published_at).toLocaleString("zh-CN") : "暂无"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      {total > PAGE_SIZE_OPTIONS[0] ? (
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
          <div className="flex flex-wrap items-center gap-2">
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
      ) : null}
    </div>
  );
};

