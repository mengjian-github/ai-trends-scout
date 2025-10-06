export const dynamic = "force-dynamic";

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

import { refreshCandidateStatuses, updateCandidateStatus } from "./actions";
import { getSupabaseAdmin } from "@/lib/supabase";

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

const ORDERED_STATUS = ["pending", "approved", "queued", "rejected", "expired"] as const;

type CandidateRow = {
  id: string;
  term: string;
  source: string;
  status: string;
  llm_label: string | null;
  llm_score: number | null;
  captured_at: string;
  expires_at: string;
  queried_at: string | null;
  rejection_reason: string | null;
};

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

const getStatusBadge = (status: string) => {
  const label = STATUS_LABEL[status] ?? status;
  const style = STATUS_STYLE[status] ?? "bg-white/10 text-white/70";
  return <span className={`rounded-full px-2 py-1 text-xs ${style}`}>{label}</span>;
};

const CandidatesPage = async () => {
  const client = getSupabaseAdmin();
  let rows: CandidateRow[] = [];

  try {
    const { data } = await client
      .from("ai_trends_candidate_roots")
      .select(
        "id, term, source, status, llm_label, llm_score, captured_at, expires_at, rejection_reason, queried_at"
      )
      .order("status", { ascending: true })
      .order("captured_at", { ascending: false })
      .limit(200);

    rows = (data ?? []) as CandidateRow[];
  } catch (error) {
    console.error("Failed to load candidate roots", error);
  }

  const grouped = ORDERED_STATUS.map((status) => ({
    status,
    items: rows.filter((row) => row.status === status),
  })).filter((group) => group.items.length > 0);

  const totals = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <section className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">候选词根队列</h2>
          <p className="mt-1 text-sm text-white/60">
            展示最近批量采集的候选词根。可在此人工筛选后再触发 DataForSEO 查询。
          </p>
        </div>
        <form action={refreshCandidateStatuses}>
          <button
            type="submit"
            className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
          >
            刷新列表
          </button>
        </form>
      </section>

      <section className="grid gap-6">
        {grouped.length === 0 ? (
          <p className="text-sm text-white/60">当前没有候选词根，可先触发资讯抓取。</p>
        ) : (
          grouped.map(({ status, items }) => (
            <div key={status} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <header className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusBadge(status)}
                  <span className="text-sm text-white/60">{items.length} / {(totals[status] ?? 0)}</span>
                </div>
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
                    {items.map((row) => (
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
            </div>
          ))
        )}
      </section>
    </div>
  );
};

export default CandidatesPage;
