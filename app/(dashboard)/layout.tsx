import type { ReactNode } from "react";
import { DashboardNav } from "@/components/dashboard-nav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1200px] flex-col px-6 py-8">
        <header className="flex flex-col gap-6 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-white/60">内部工具集</p>
            <h1 className="mt-2 text-2xl font-semibold">AI 趋势侦察</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/60">
              通过 Google 趋势与新闻信号监测主要市场中涌现的 AI 需求关键词。
            </p>
          </div>
          <DashboardNav />
        </header>
        <main className="flex-1 pb-12">{children}</main>
        <footer className="mt-auto border-t border-white/10 pt-6 text-xs text-white/40">
          数据由 DataForSEO 刷新 · 基准关键词：gpts · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}
