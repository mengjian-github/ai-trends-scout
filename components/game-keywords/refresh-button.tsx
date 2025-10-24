"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCcw } from "lucide-react";
import type { GameKeywordProgressUpdate, GameKeywordRefreshResult } from "@/lib/services/game-keywords";

type SourceProgress = {
  source: string;
  status: "pending" | "processing" | "done" | "error";
  totalUrls: number;
  acceptedUrls: number;
  filteredUrls: number;
  durationMs?: number;
  message?: string;
};

type ChunkProgress = {
  totalChunks: number;
  completedChunks: number;
  inserted: number;
  updated: number;
};

const initialChunkProgress: ChunkProgress = {
  totalChunks: 0,
  completedChunks: 0,
  inserted: 0,
  updated: 0,
};

type AggregateProgress = {
  processed: number;
  accepted: number;
  filtered: number;
  sourcesCompleted: number;
};

const initialAggregate: AggregateProgress = {
  processed: 0,
  accepted: 0,
  filtered: 0,
  sourcesCompleted: 0,
};

const formatDuration = (value?: number) => {
  if (!value || value <= 0) {
    return "—";
  }
  if (value < 1000) {
    return `${value} ms`;
  }
  return `${(value / 1000).toFixed(1)} s`;
};

export const RefreshGameKeywordsButton = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [totalSources, setTotalSources] = useState<number | null>(null);
  const [sources, setSources] = useState<Record<string, SourceProgress>>({});
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress>(initialChunkProgress);
  const [summary, setSummary] = useState<{
    inserted: number;
    updated: number;
    totalAccepted: number;
    totalFiltered: number;
    totalProcessed: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedResult, setCompletedResult] = useState<GameKeywordRefreshResult | null>(null);
  const [aggregate, setAggregate] = useState<AggregateProgress>(initialAggregate);
  const [showDetails, setShowDetails] = useState(true);

  const resetState = useCallback(() => {
    setTotalSources(null);
    setSources({});
    setChunkProgress(initialChunkProgress);
    setSummary(null);
    setErrorMessage(null);
    setCompletedResult(null);
    setAggregate(initialAggregate);
  }, []);

  const handleProgressUpdate = useCallback((update: GameKeywordProgressUpdate) => {
    switch (update.type) {
      case "start":
        setTotalSources(update.totalSources);
        setSources({});
        setAggregate(initialAggregate);
        break;
      case "source:start":
        setSources((prev) => ({
          ...prev,
          [update.source]: {
            source: update.source,
            status: "processing",
            totalUrls: 0,
            acceptedUrls: 0,
            filteredUrls: 0,
          },
        }));
        break;
      case "source:complete":
        setSources((prev) => ({
          ...prev,
          [update.source]: {
            source: update.source,
            status: "done",
            totalUrls: update.totalUrls,
            acceptedUrls: update.acceptedUrls,
            filteredUrls: update.filteredUrls,
            durationMs: update.durationMs,
          },
        }));
        setAggregate((prev) => ({
          processed: prev.processed + update.totalUrls,
          accepted: prev.accepted + update.acceptedUrls,
          filtered: prev.filtered + update.filteredUrls,
          sourcesCompleted: prev.sourcesCompleted + 1,
        }));
        break;
      case "source:error":
        setSources((prev) => ({
          ...prev,
          [update.source]: {
            source: update.source,
            status: "error",
            totalUrls: 0,
            acceptedUrls: 0,
            filteredUrls: 0,
            message: update.reason,
          },
        }));
        setAggregate((prev) => ({
          ...prev,
          sourcesCompleted: prev.sourcesCompleted + 1,
        }));
        break;
      case "upsert:chunk":
        setChunkProgress((prev) => ({
          totalChunks: update.total,
          completedChunks: Math.max(prev.completedChunks, update.index),
          inserted: prev.inserted + update.inserted,
          updated: prev.updated + update.updated,
        }));
        if (update.error) {
          setErrorMessage(
            `写库失败（块 ${update.index}/${update.total}）：${update.error.reason}` +
              (update.error.code ? ` · 代码 ${update.error.code}` : "")
          );
        }
        break;
      case "summary":
        setSummary({
          inserted: update.inserted,
          updated: update.updated,
          totalAccepted: update.totalAccepted,
          totalFiltered: update.totalFiltered,
          totalProcessed: update.totalProcessed,
        });
        setAggregate((prev) => ({
          processed: update.totalProcessed,
          accepted: update.totalAccepted,
          filtered: update.totalFiltered,
          sourcesCompleted: prev.sourcesCompleted,
        }));
        break;
      case "error":
        setErrorMessage(update.message);
        break;
      case "complete":
        // handled when stream ends
        break;
      default:
        break;
    }
  }, []);

  const handleStream = useCallback(async () => {
    const response = await fetch("/api/game-keywords/refresh?persist=true", {
      method: "POST",
      headers: {
        Accept: "application/x-ndjson",
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`请求失败：${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          try {
            const event = JSON.parse(trimmed) as
              | { type: "progress"; data: GameKeywordProgressUpdate }
              | { type: "complete"; data: GameKeywordRefreshResult }
              | { type: "error"; message: string };

            if (event.type === "progress") {
              handleProgressUpdate(event.data);
            } else if (event.type === "error") {
              throw new Error(event.message);
            } else if (event.type === "complete") {
              setCompletedResult(event.data);
              setAggregate((prev) => ({
                processed: event.data.processedKeywords,
                accepted: event.data.acceptedCount,
                filtered: event.data.filteredCount,
                sourcesCompleted: prev.sourcesCompleted,
              }));
            }
          } catch (error) {
            console.error("Failed to parse refresh event", error);
          }
        }
      }

      if (done) {
        break;
      }
    }
  }, [handleProgressUpdate]);

  const handleRefresh = useCallback(async () => {
    if (isRunning) {
      return;
    }

    resetState();
    setIsRunning(true);

    try {
      await handleStream();
    } catch (error) {
      setErrorMessage((error as Error).message ?? "刷新失败，请稍后重试。");
    } finally {
      setIsRunning(false);
    }
  }, [handleStream, isRunning, resetState]);

  const orderedSources = useMemo(() => Object.values(sources), [sources]);

  return (
    <div className="flex w-full flex-col items-end gap-4">
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRunning}
          className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm text-white transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/50"
        >
          <RefreshCcw size={16} className={isRunning ? "animate-spin" : undefined} />
          {isRunning ? "刷新中..." : "刷新游戏关键词"}
        </button>
        {errorMessage ? <p className="text-xs text-rose-300">{errorMessage}</p> : null}
        {summary && !errorMessage ? (
          <p className="text-xs text-emerald-200">
            新增 {summary.inserted} · 更新 {summary.updated} · 已入库 {summary.totalAccepted} 条 · 已过滤 {summary.totalFiltered} 条 ·
            总处理 {summary.totalProcessed}
          </p>
        ) : null}
      </div>

      {(isRunning || orderedSources.length > 0 || chunkProgress.completedChunks > 0 || completedResult) && (
        <div className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-white/70">
          {totalSources !== null ? (
            <p className="mb-2 text-white/60">
              进度：{aggregate.sourcesCompleted}/{totalSources} 完成
            </p>
          ) : (
            <p className="mb-2 text-white/60">进度监控已启动</p>
          )}
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-white/10 bg-black/40 px-3 py-2">
              <p className="text-[11px] uppercase text-white/45">已处理</p>
              <p className="mt-1 text-sm text-white">{aggregate.processed}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-black/40 px-3 py-2">
              <p className="text-[11px] uppercase text-white/45">已入库</p>
              <p className="mt-1 text-sm text-white">{aggregate.accepted}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-black/40 px-3 py-2">
              <p className="text-[11px] uppercase text-white/45">已过滤</p>
              <p className="mt-1 text-sm text-white">{aggregate.filtered}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-black/40 px-3 py-2">
              <p className="text-[11px] uppercase text-white/45">完成站点</p>
              <p className="mt-1 text-sm text-white">
                {aggregate.sourcesCompleted}
                {totalSources !== null ? ` / ${totalSources}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[11px] uppercase text-white/45">站点详情</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/60 hover:border-white/30 hover:text-white"
              onClick={() => setShowDetails((prev) => !prev)}
            >
              {showDetails ? (
                <>
                  <ChevronUp size={12} /> 收起
                </>
              ) : (
                <>
                  <ChevronDown size={12} /> 展开
                </>
              )}
            </button>
          </div>
          {showDetails ? (
            <div className="mt-2 max-h-60 overflow-y-auto overflow-x-auto rounded-md border border-white/10 bg-white/5">
              {orderedSources.length > 0 ? (
                <table className="w-full min-w-[640px] text-xs text-white/70">
                  <thead className="bg-black/40 text-[11px] uppercase tracking-wide text-white/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">站点</th>
                      <th className="px-3 py-2 text-left font-medium">状态</th>
                      <th className="px-3 py-2 text-right font-medium">采集</th>
                      <th className="px-3 py-2 text-right font-medium">过滤</th>
                      <th className="px-3 py-2 text-right font-medium">总计</th>
                      <th className="px-3 py-2 text-right font-medium">耗时</th>
                      <th className="px-3 py-2 text-left font-medium">备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedSources.map((item) => {
                      const statusLabel =
                        item.status === "done" ? "完成" : item.status === "error" ? "失败" : "处理中";
                      const statusClass =
                        item.status === "done"
                          ? "text-emerald-200"
                          : item.status === "error"
                          ? "text-rose-300"
                          : "text-amber-200";
                      return (
                        <tr key={item.source} className="border-t border-white/5">
                          <td className="px-3 py-2 text-white">{item.source}</td>
                          <td className={`px-3 py-2 ${statusClass}`}>{statusLabel}</td>
                          <td className="px-3 py-2 text-right text-white/80">{item.acceptedUrls}</td>
                          <td className="px-3 py-2 text-right text-white/60">{item.filteredUrls}</td>
                          <td className="px-3 py-2 text-right text-white/60">{item.totalUrls}</td>
                          <td className="px-3 py-2 text-right text-white/60">{formatDuration(item.durationMs)}</td>
                          <td className="px-3 py-2 text-white/50">{item.message ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="px-3 py-2 text-white/50">等待站点任务开始...</p>
              )}
            </div>
          ) : null}
          {chunkProgress.totalChunks > 0 ? (
            <div className="mt-3 rounded-md border border-white/10 bg-black/40 px-3 py-2">
              <p className="text-white/60">
                写入进度：{chunkProgress.completedChunks}/{chunkProgress.totalChunks} · 新增 {chunkProgress.inserted} ·
                更新 {chunkProgress.updated}
              </p>
            </div>
          ) : null}
          {completedResult ? (
            <p className="mt-2 text-[11px] text-white/45">
              已入库 {completedResult.acceptedCount} · 已过滤 {completedResult.filteredCount} · 总耗时{" "}
              {formatDuration(completedResult.durationMs)} · 失败站点 {completedResult.errors.length}
            </p>
          ) : null}
        </div>
      )}

    </div>
  );
};
