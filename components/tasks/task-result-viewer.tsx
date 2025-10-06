"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

import type {
  NormalizedTaskResult,
  ExploreGraphPoint,
  ExploreItem,
  ExploreMapEntry,
  ExploreRankedQuery,
} from "@/lib/tasks/dataforseo";
import { buildGoogleTrendsUrl } from "@/lib/google-trends";
import { normalizeTaskResults } from "@/lib/tasks/dataforseo";
import type { RunTaskItem } from "@/types/tasks";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import clsx from "clsx";

const regionNameDictionary: Record<string, string> = {
  worldwide: "全球",
  "united states": "美国",
  "united kingdom": "英国",
  canada: "加拿大",
  australia: "澳大利亚",
  germany: "德国",
  france: "法国",
  india: "印度",
  japan: "日本",
  "south korea": "韩国",
  singapore: "新加坡",
  "hong kong": "香港",
  taiwan: "台湾",
  china: "中国",
  brazil: "巴西",
  mexico: "墨西哥",
  spain: "西班牙",
  italy: "意大利",
  russia: "俄罗斯",
  thailand: "泰国",
  indonesia: "印度尼西亚",
  vietnam: "越南",
  malaysia: "马来西亚",
  philippines: "菲律宾",
  turkey: "土耳其",
  netherlands: "荷兰",
  switzerland: "瑞士",
  sweden: "瑞典",
  norway: "挪威",
  finland: "芬兰",
  denmark: "丹麦",
  belgium: "比利时",
  austria: "奥地利",
  "new zealand": "新西兰",
  ireland: "爱尔兰",
  "south africa": "南非",
};

const regionDisplayNames = (() => {
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames === "undefined") {
    return undefined;
  }

  try {
    return new Intl.DisplayNames(["zh-CN"], { type: "region", fallback: "code" });
  } catch {
    return undefined;
  }
})();

const toChineseRegionName = (geoId?: string, geoName?: string) => {
  const candidates = [] as string[];

  if (geoId) {
    const upper = geoId.toUpperCase();
    candidates.push(upper);
    const segments = upper.split("-");
    if (segments.length > 1) {
      candidates.push(segments[segments.length - 1]);
      candidates.push(segments[0]);
    }
  }

  for (const candidate of candidates) {
    const translated = regionDisplayNames?.of(candidate);
    if (translated && translated !== candidate) {
      return translated;
    }
  }

  if (geoName) {
    const match = regionNameDictionary[geoName.toLowerCase()];
    if (match) {
      return match;
    }
  }

  if (geoId) {
    const match = regionNameDictionary[geoId.toLowerCase()];
    if (match) {
      return match;
    }
  }

  return undefined;
};

const formatDate = (timestamp: number | undefined) => {
  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp * 1000);
  return format(date, "yyyy-MM-dd", { locale: zhCN });
};

const formatValue = (value: number | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  return value.toFixed(0);
};

const paginationSelectClass =
  "rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-white focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400";
const subtleButtonClass =
  "rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/80 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40";

const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_MAP_PAGE_SIZE = TABLE_PAGE_SIZE_OPTIONS[0];
const DEFAULT_QUERY_PAGE_SIZE = TABLE_PAGE_SIZE_OPTIONS[0];

const renderSparkBars = (points: ExploreGraphPoint[]) => {
  if (points.length === 0) {
    return <p className="text-xs text-white/50">暂无时间序列数据。</p>;
  }

  const limited = points.slice(-120);
  const maxValue = Math.max(...limited.map((point) => point.value), 0);

  if (maxValue <= 0) {
    return <p className="text-xs text-white/50">系列值全为零或缺失。</p>;
  }

  return (
    <div className="flex h-32 items-end gap-[1px] rounded-md border border-white/10 bg-black/40 p-2">
      {limited.map((point) => {
        const heightPercent = Math.max(2, Math.round((point.value / maxValue) * 100));
        const tooltip = `${formatDate(point.timestamp)} · ${formatValue(point.value)}`;
        return (
          <div
            key={`${point.timestamp}`}
            className={clsx(
              "flex-1 rounded-t-sm",
              point.missing ? "bg-white/20" : "bg-emerald-400/80 hover:bg-emerald-300"
            )}
            style={{ height: `${heightPercent}%`, minWidth: "2px" }}
            title={tooltip}
          />
        );
      })}
    </div>
  );
};

const renderGraphItem = (item: Extract<ExploreItem, { type: "google_trends_graph" }>) => {
  const points = item.data;
  const averageValue =
    points.length > 0
      ? Math.round(points.reduce((sum, point) => sum + point.value, 0) / points.length)
      : undefined;
  const topPoint = points.reduce<ExploreGraphPoint | undefined>((accumulator, point) => {
    if (!accumulator) {
      return point;
    }
    return point.value > accumulator.value ? point : accumulator;
  }, undefined);

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-white/90">{item.title ?? "趋势图"}</p>
          <p className="text-xs text-white/50">关键词：{item.keywords.join("，")}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <span>平均值：{formatValue(averageValue)}</span>
          <span>
            峰值：{formatValue(topPoint?.value)}（{formatDate(topPoint?.timestamp)}）
          </span>
          <span>缺失点：{item.data.filter((point) => point.missing).length}</span>
        </div>
      </header>

      {renderSparkBars(points)}

      {Object.keys(item.averages).length > 0 ? (
        <div className="grid gap-2 rounded-md border border-white/5 bg-black/30 p-3 text-xs text-white/60 md:grid-cols-2">
          {Object.entries(item.averages).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between rounded bg-white/5 px-2 py-1">
              <span className="text-white/70">{key}</span>
              <span>{formatValue(typeof value === "number" ? value : undefined)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

const MapTable = ({ entries }: { entries: ExploreMapEntry[] }) => {
  const total = entries.length;
  const [pageSize, setPageSize] = useState(DEFAULT_MAP_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(() => (total === 0 ? 1 : Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [entries]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return entries.slice(startIndex, startIndex + pageSize);
  }, [entries, currentPage, pageSize]);

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
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-[460px] w-full text-left text-xs text-white/70">
          <thead>
            <tr className="text-white/50">
              <th className="pb-2 pr-4 font-medium">地区</th>
              <th className="pb-2 pr-4 font-medium">值</th>
              <th className="pb-2 pr-4 font-medium">最大值索引</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEntries.map((entry, index) => {
              const rowKey = entry.geoId ?? entry.geoName ?? `${index}-${currentPage}`;
              return (
                <tr key={rowKey} className="border-b border-white/5 last:border-none">
                  <td className="py-2 pr-4 text-white">
                    <div className="font-medium text-white/90">
                      {entry.geoName ?? "未知"}
                      {(() => {
                        const zhName = toChineseRegionName(entry.geoId, entry.geoName);
                        if (!zhName || zhName === entry.geoName) {
                          return null;
                        }
                        return <span className="ml-2 text-xs text-white/60">（{zhName}）</span>;
                      })()}
                    </div>
                    <div className="text-[10px] uppercase text-white/40">{entry.geoId ?? "—"}</div>
                  </td>
                  <td className="py-2 pr-4 text-sm text-white/80">{formatValue(entry.value)}</td>
                  <td className="py-2 pr-4 text-xs text-white/50">{entry.maxValueIndex ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 text-[11px] text-white/60 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span>每页显示</span>
          <select className={paginationSelectClass} value={pageSize} onChange={handlePageSizeChange}>
            {TABLE_PAGE_SIZE_OPTIONS.map((option) => (
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

const MapItem = ({ item }: { item: Extract<ExploreItem, { type: "google_trends_map" }> }) => {
  const entries = useMemo(
    () => [...item.data].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [item.data]
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <header>
        <p className="text-sm font-medium text-white/90">{item.title ?? "地区热度分布"}</p>
        <p className="text-xs text-white/50">关键词：{item.keywords.join("，")}</p>
      </header>
      <MapTable entries={entries} />
    </section>
  );
};

const QueriesTable = ({ queries }: { queries: ExploreRankedQuery[] }) => {
  const total = queries.length;
  const [pageSize, setPageSize] = useState(DEFAULT_QUERY_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(() => (total === 0 ? 1 : Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [queries]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedQueries = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return queries.slice(startIndex, startIndex + pageSize);
  }, [queries, currentPage, pageSize]);

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
    <div className="mt-2 space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-[360px] w-full text-left text-xs text-white/70">
          <thead>
            <tr className="text-white/50">
              <th className="pb-2 pr-4 font-medium">查询</th>
              <th className="pb-2 pr-4 font-medium">热度</th>
            </tr>
          </thead>
          <tbody>
            {paginatedQueries.map((query, index) => {
              const valueNumber = typeof query.value === "number" ? query.value : undefined;
              const highlight = valueNumber !== undefined && valueNumber >= 100;
              const rowKey = query.query ?? `${index}-${currentPage}`;
              const queryText = query.query?.trim();

              return (
                <tr
                  key={rowKey}
                  className={clsx("border-b border-white/5 last:border-none", highlight && "bg-emerald-500/10")}
                >
                  <td
                    className={clsx(
                      "py-2 pr-4",
                      highlight ? "text-emerald-100 font-semibold" : "text-white"
                    )}
                  >
                    {queryText ? (
                      <a
                        href={buildGoogleTrendsUrl(queryText)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {queryText}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={clsx("py-2 pr-4", highlight ? "text-emerald-200 font-semibold" : "text-white/80")}>{formatValue(query.value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 text-[11px] text-white/60 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span>每页显示</span>
          <select className={paginationSelectClass} value={pageSize} onChange={handlePageSizeChange}>
            {TABLE_PAGE_SIZE_OPTIONS.map((option) => (
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

const QueriesItem = ({ item }: { item: Extract<ExploreItem, { type: "google_trends_queries_list" }> }) => {
  if (item.top.length === 0 && item.rising.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <header>
        <p className="text-sm font-medium text-white/90">{item.title ?? "相关查询"}</p>
        <p className="text-xs text-white/50">关键词：{item.keywords.join("，")}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {item.top.length > 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="text-xs font-medium text-white/80">Top</p>
            <QueriesTable queries={item.top} />
          </div>
        ) : null}
        {item.rising.length > 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="text-xs font-medium text-white/80">Rising</p>
            <QueriesTable queries={item.rising} />
          </div>
        ) : null}
      </div>
    </section>
  );
};

const renderUnknownItem = (item: Extract<ExploreItem, { type: string; raw: unknown }>) => (
  <section className="space-y-2">
    <header>
      <p className="text-sm font-medium text-white/90">{item.title ?? item.type}</p>
      <p className="text-xs text-white/50">暂不支持的结果类型，以下为原始数据</p>
    </header>
    <details className="rounded-lg border border-white/10 bg-black/30 p-3">
      <summary className="cursor-pointer text-xs text-white/70 hover:text-white">展开原始数据</summary>
      <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap text-[11px] text-white/60">
        {JSON.stringify(item.raw, null, 2) ?? "null"}
      </pre>
    </details>
  </section>
);

const renderExploreItem = (item: ExploreItem) => {
  if (item.type === "google_trends_graph") {
    return renderGraphItem(item as Extract<ExploreItem, { type: "google_trends_graph" }>);
  }

  if (item.type === "google_trends_map") {
    return (
      <MapItem
        item={item as Extract<ExploreItem, { type: "google_trends_map" }>}
      />
    );
  }

  if (item.type === "google_trends_topics_list") {
    return null;
  }

  if (item.type === "google_trends_queries_list") {
    return (
      <QueriesItem
        item={item as Extract<ExploreItem, { type: "google_trends_queries_list" }>}
      />
    );
  }

  return renderUnknownItem(item as Extract<ExploreItem, { type: string; raw: unknown }>);
};

const renderResult = (result: NormalizedTaskResult["results"][number], index: number) => (
  <article key={`result-${index}`} className="space-y-5 rounded-xl border border-white/10 bg-white/5 p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-white">关键词组合</h3>
        <p className="text-sm text-white/70">{result.keywords.length ? result.keywords.join("，") : "—"}</p>
      </div>
      <div className="text-xs text-white/60">
        <div>收集时间：{result.datetime ?? "—"}</div>
        <div>地区代码：{result.locationCode ?? "—"} · 语言：{result.languageCode ?? "—"}</div>
        {result.checkUrl ? (
          <a
            href={result.checkUrl}
            className="mt-1 inline-flex items-center text-xs text-emerald-300 underline hover:text-emerald-200"
            target="_blank"
            rel="noopener noreferrer"
          >
            查看 Google Trends
          </a>
        ) : null}
      </div>
    </header>

    <div className="space-y-6">
      {result.items.length === 0 ? (
        <p className="text-xs text-white/50">该关键词组未返回结构化结果。</p>
      ) : (
        result.items.map((item, idx) => {
          const content = renderExploreItem(item);
          if (!content) {
            return null;
          }
          return <div key={`${item.type}-${idx}`}>{content}</div>;
        })
      )}
    </div>
  </article>
);

const renderMeta = (
  meta: NormalizedTaskResult["meta"],
  task: RunTaskItem,
  resultCountFallback?: number
) => {
  const formatDuration = (start?: string | null, end?: string | null) => {
    if (!start || !end) {
      return undefined;
    }

    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return undefined;
    }

    const diffMs = Math.max(0, endMs - startMs);
    if (diffMs < 1000) {
      return "<1 秒";
    }

    const totalSeconds = Math.round(diffMs / 1000);
    if (totalSeconds < 60) {
      return `${totalSeconds} 秒`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes < 60) {
      return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const parts = [`${hours} 时`];
    if (remainingMinutes > 0) {
      parts.push(`${remainingMinutes} 分`);
    }
    if (seconds > 0) {
      parts.push(`${seconds} 秒`);
    }
    return parts.join(" ");
  };

  const costValue = meta.cost ?? (typeof task.cost === "number" ? task.cost : undefined);
  const computedDuration = meta.time ?? formatDuration(task.postedAt, task.completedAt);
  const computedResultCount =
    meta.resultCount !== undefined
      ? meta.resultCount
      : resultCountFallback !== undefined
        ? resultCountFallback
        : undefined;

  const entries: Array<[string, string]> = [
    ["任务 ID", meta.id ?? task.taskId ?? "—"],
    ["状态码", meta.statusCode !== undefined ? String(meta.statusCode) : "—"],
    ["状态说明", meta.statusMessage ?? task.status ?? "—"],
    ["任务耗时", computedDuration ?? "—"],
    ["结果数量", computedResultCount !== undefined ? String(computedResultCount) : "—"],
    ["费用 (USD)", costValue !== undefined ? costValue.toFixed(4) : "—"],
  ];

  return (
    <div className="grid gap-2 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/70 md:grid-cols-3">
      {entries.map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <span className="text-white/50">{label}</span>
          <span className="text-white/80">{value}</span>
        </div>
      ))}
      {meta.path && meta.path.length > 0 ? (
        <div className="md:col-span-3">
          <span className="text-white/50">API 路径</span>
          <div className="mt-1 rounded bg-white/5 px-2 py-1 text-[11px] text-white/70">{meta.path.join(" / ")}</div>
        </div>
      ) : null}
    </div>
  );
};

export const TaskResultViewer = ({ task }: { task: RunTaskItem }) => {
  const normalized = normalizeTaskResults(task.result);

  if (normalized.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-white/70">暂未收到 DataForSEO 结果，可稍后刷新查看。</p>
        <details className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/60">
          <summary className="cursor-pointer text-white/70 hover:text-white">查看原始数据</summary>
          <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap text-[11px]">
            {JSON.stringify(task.result, null, 2) ?? "null"}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {normalized.map((entry, index) => (
        <section key={`normalized-${index}`} className="space-y-4">
          {renderMeta(
            entry.meta,
            task,
            entry.results.reduce((total, result) => {
              if (typeof result.itemsCount === "number" && Number.isFinite(result.itemsCount)) {
                return total + result.itemsCount;
              }

              return total + result.items.length;
            }, 0)
          )}
          {entry.results.length > 0 ? (
            <div className="space-y-6">{entry.results.map((result, idx) => renderResult(result, idx))}</div>
          ) : (
            <p className="text-xs text-white/50">该任务结果为空。</p>
          )}
        </section>
      ))}

      <details className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/60">
        <summary className="cursor-pointer text-white/70 hover:text-white">查看原始 JSON</summary>
        <pre className="mt-2 max-h-[480px] overflow-auto whitespace-pre-wrap text-[11px]">
          {JSON.stringify(task.result, null, 2) ?? "null"}
        </pre>
      </details>
    </div>
  );
};
