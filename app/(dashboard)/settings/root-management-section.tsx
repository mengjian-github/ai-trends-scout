import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { developedMarkets } from "@/lib/env";
import { getAllRoots, type TrendRootRow } from "@/lib/supabase";
import { RootCreateForm } from "./_components/root-create-form";
import { RootTable } from "./_components/root-table";

type Summary = {
  total: number;
  active: number;
  inactive: number;
  lastUpdatedLabel: string | null;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const buildSummary = (roots: TrendRootRow[]): Summary => {
  const total = roots.length;
  const active = roots.filter((root) => root.is_active).length;
  const inactive = total - active;
  const latest = roots.reduce<string | null>((acc, root) => {
    if (!root.updated_at) {
      return acc;
    }

    if (!acc) {
      return root.updated_at;
    }

    return acc > root.updated_at ? acc : root.updated_at;
  }, null);

  return {
    total,
    active,
    inactive,
    lastUpdatedLabel: formatDateTime(latest),
  };
};

export const RootManagementSection = async () => {
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  let roots: TrendRootRow[] = [];
  let errorMessage: string | null = null;

  if (supabaseConfigured) {
    try {
      roots = await getAllRoots();
    } catch (error) {
      console.error("Failed to fetch root list", error);
      errorMessage = "读取词根列表失败，请稍后重试。";
    }
  } else {
    errorMessage = "未配置 Supabase 服务端凭证，无法从数据库读取词根列表。";
  }

  const summary = buildSummary(roots);

  const localeSuggestions = (() => {
    const uniques = Array.from(new Set(roots.map((root) => root.locale))).sort();
    if (uniques.length > 0) {
      return uniques;
    }

    if (developedMarkets.length > 0) {
      return [...developedMarkets, "global"];
    }

    return ["global"];
  })();

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">词根管理</h2>
          <p className="text-sm text-white/60">
            维护 DataForSEO 抓取任务使用的词根，可在此新增、编辑、停用或删除现有记录。
            {summary.lastUpdatedLabel ? ` 最近更新：${summary.lastUpdatedLabel}` : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200">启用 {summary.active}</span>
          <span className="rounded-full bg-white/10 px-3 py-1">停用 {summary.inactive}</span>
          <span className="rounded-full bg-white/5 px-3 py-1">总数 {summary.total}</span>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr]">
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle className="text-base text-white">新增词根</CardTitle>
          </CardHeader>
          <CardContent>
            <RootCreateForm
              disabled={!supabaseConfigured}
              existingLocales={localeSuggestions}
            />
          </CardContent>
        </Card>
        <Card className="bg-black/15">
          <CardHeader>
            <CardTitle className="text-base text-white">当前词根</CardTitle>
          </CardHeader>
          <CardContent>
            <RootTable roots={roots} supabaseConfigured={supabaseConfigured} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
