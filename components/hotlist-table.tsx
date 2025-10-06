import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { HotKeyword } from "@/types/trends";
import { formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const countryLabels: Record<string, string> = {
  us: "美国",
  gb: "英国",
  de: "德国",
  fr: "法国",
  ca: "加拿大",
  au: "澳大利亚",
  nz: "新西兰",
  se: "瑞典",
  sg: "新加坡",
  jp: "日本",
  kr: "韩国",
  eu: "欧盟",
  global: "全球",
};

const timeframeLabels: Record<string, string> = {
  "now%201%2Bd": "过去 24 小时",
  "now%207-d": "过去 7 天",
  past_7_days: "过去 7 天",
  past_30_days: "过去 30 天",
};

const priorityLabels: Record<string, string> = {
  "24h": "24 小时新词",
  "72h": "72 小时新词",
};

const priorityStyles: Record<string, string> = {
  "24h": "bg-rose-500/20 text-rose-200",
  "72h": "bg-amber-500/20 text-amber-200",
};

const buildGoogleTrendsUrl = (keyword: string) => {
  const normalized = keyword.trim();
  const queryParam = normalized.length > 0 ? `&q=${encodeURIComponent(normalized)}` : "";
  return `https://trends.google.com/trends/explore?date=now%207-d${queryParam}`;
};

interface HotlistTableProps {
  title: string;
  timeframe: string;
  keywords: HotKeyword[];
}

export const HotlistTable = ({ title, timeframe, keywords }: HotlistTableProps) => {
  const hasData = keywords.length > 0;
  const timeframeLabel = timeframeLabels[timeframe] ?? decodeURIComponent(timeframe);

  return (
    <Card className="bg-black/15">
      <CardHeader>
        <div>
          <CardTitle className="text-base text-white">{title}</CardTitle>
          <p className="mt-1 text-xs text-white/60">时间范围：{timeframeLabel}</p>
        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-white/50">该时间范围内暂无关键词。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-white/50">
                  <th className="pb-2 pr-4 font-medium">排名</th>
                  <th className="pb-2 pr-4 font-medium">关键词</th>
                  <th className="pb-2 pr-4 font-medium">优先级</th>
                  <th className="pb-2 pr-4 font-medium">地区</th>
                  <th className="pb-2 pr-4 font-medium">峰值</th>
                  <th className="pb-2 pr-4 font-medium">首次出现</th>
                  <th className="pb-2 pr-4 font-medium">最近更新</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((item, index) => (
                  <tr key={item.id} className="border-b border-white/5 last:border-none">
                    <td className="py-3 pr-4 text-white/60">第{index + 1}名</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col">
                        <a
                          href={buildGoogleTrendsUrl(item.keyword)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-white hover:underline"
                        >
                          {item.keyword}
                        </a>
                        {item.summary ? <span className="text-xs text-white/50">{item.summary}</span> : null}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      {item.priority ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${priorityStyles[item.priority] ?? "bg-white/10 text-white/70"}`}
                        >
                          {priorityLabels[item.priority] ?? item.priority.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-sm text-white/40">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-white/70">{countryLabels[item.locale] ?? item.locale.toUpperCase()}</td>
                    <td className="py-3 pr-4 text-white">{formatNumber(item.spike_score, { maximumFractionDigits: 2 })}</td>
                    <td className="py-3 pr-4 text-white/60">
                      {item.first_seen
                        ? formatDistanceToNow(new Date(item.first_seen), { addSuffix: true, locale: zhCN })
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-white/60">
                      {item.last_seen
                        ? formatDistanceToNow(new Date(item.last_seen), { addSuffix: true, locale: zhCN })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
