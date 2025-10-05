import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { HotKeyword } from "@/types/trends";
import { formatNumber, formatPercentChange } from "@/lib/utils";
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

type HotlistTableProps = {
  title: string;
  timeframe: string;
  keywords: HotKeyword[];
};

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
                  <th className="pb-2 pr-4 font-medium">地区</th>
                  <th className="pb-2 pr-4 font-medium">相对 gpts 比值</th>
                  <th className="pb-2 pr-4 font-medium">动量</th>
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
                        <Link href={`/keywords/${encodeURIComponent(item.id)}`} className="text-sm font-medium text-white hover:underline">
                          {item.keyword}
                        </Link>
                        {item.summary ? <span className="text-xs text-white/50">{item.summary}</span> : null}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-white/70">{countryLabels[item.locale] ?? item.locale.toUpperCase()}</td>
                    <td className="py-3 pr-4 text-white">{formatNumber(item.latest_ratio, { maximumFractionDigits: 2 })}</td>
                    <td className={`py-3 pr-4 ${Number(item.momentum ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {formatPercentChange(item.momentum)}
                    </td>
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

