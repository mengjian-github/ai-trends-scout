"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { triggerTrendsRun } from "@/app/(dashboard)/tasks/actions";

const buttonBase =
  "inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10";

export const TriggerRunButton = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await triggerTrendsRun();
        if (result?.status === "ok") {
          setMessage(`已提交 ${result.posted ?? 0} 个任务${result.errors ? `，失败 ${result.errors} 个` : ""}`);
          router.refresh();
          if (result.runId) {
            router.push(`/tasks/${result.runId}`);
          }
        } else {
          setMessage("触发失败，请稍后重试。");
        }
      } catch (error) {
        console.error("Failed to trigger run", error);
        setMessage("触发失败，请检查服务器日志。");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 text-sm text-white/70">
      <button type="button" className={buttonBase} onClick={handleClick} disabled={isPending}>
        {isPending ? "正在触发…" : "手动触发 DataForSEO 任务"}
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
};
