"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { triggerNewsIngest } from "@/app/(dashboard)/news/actions";

const buttonClass =
  "inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10";

export const TriggerNewsIngestButton = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = () => {
    setMessage(null);

    startTransition(async () => {
      try {
        const result = await triggerNewsIngest();
        if (result) {
          const summary = `已更新 ${result.inserted} 条新闻，刷新 ${result.updated} 条，忽略 ${result.skipped} 条。`;
          setMessage(summary);
          router.refresh();
        } else {
          setMessage("触发失败，请稍后重试。");
        }
      } catch (error) {
        console.error("Failed to ingest news", error);
        setMessage("触发失败，请检查服务器日志。");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 text-sm text-white/70">
      <button type="button" className={buttonClass} onClick={handleClick} disabled={isPending}>
        {isPending ? "正在抓取…" : "手动抓取最新 AI 新闻"}
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
};

