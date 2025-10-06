export const dynamic = "force-dynamic";

import { refreshCandidateStatuses } from "./actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CandidateGroupCard } from "@/components/candidates/candidate-group-card";
import type { CandidateRow } from "@/types/candidates";

const ORDERED_STATUS = ["pending", "approved", "queued", "rejected", "expired"] as const;

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
            <CandidateGroupCard key={status} status={status} items={items} />
          ))
        )}
      </section>
    </div>
  );
};

export default CandidatesPage;
