import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { developedMarkets, trendTimeframes } from "@/lib/env";
import { RootManagementSection } from "./root-management-section";

const localeNameMap: Record<string, string> = {
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

const timeframeNameMap: Record<string, string> = {
  past_7_days: "过去 7 天",
  past_30_days: "过去 30 天",
  "now%201%2Bd": "过去 24 小时",
  "now%207-d": "过去 7 天",
};

const SettingsPage = () => {
  const displayedMarkets =
    developedMarkets.length > 0
      ? developedMarkets.map((item) => localeNameMap[item] ?? item.toUpperCase()).join("、")
      : "尚未配置";

  const displayedTimeframes =
    trendTimeframes.length > 0
      ? trendTimeframes.map((item) => timeframeNameMap[item] ?? decodeURIComponent(item)).join("、")
      : "尚未配置";

  return (
    <div className="space-y-8">
      <RootManagementSection />
      <section className="grid gap-6 md:grid-cols-2">
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle>数据来源</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/70">
            <p>DataForSEO 凭据与 Supabase 连接通过 Vercel 和 Cloudflare Workers 的环境变量统一管理。</p>
            <p>下一步计划：提供表单以测试凭据，并支持触发手动同步任务。</p>
          </CardContent>
        </Card>
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle>监测范围</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/70">
            <p>监测市场：{displayedMarkets}</p>
            <p>时间范围：{displayedTimeframes}</p>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-6 md:grid-cols-2">
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle>品牌过滤</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/70">
            <p>未来将在此配置基于规则的品牌屏蔽。支持上传 CSV 或在线编辑以维护黑名单。</p>
          </CardContent>
        </Card>
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle>通知</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-white/70">
            <p>配置阈值规则和通知渠道（电子邮件、Slack、飞书等）。当前数据存储在 Supabase 表 ai_trends_notifications 中。</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default SettingsPage;

