export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseAdmin } from "@/lib/supabase";

const NewsPage = async () => {
  let newsItems: Array<{
    id: string;
    title: string;
    url: string;
    source: string | null;
    published_at: string | null;
    summary: string | null;
  }> = [];

  try {
    const client = getSupabaseAdmin();
    const { data } = await client
      .from("ai_trends_news")
      .select("id, title, url, source, published_at, summary")
      .order("published_at", { ascending: false })
      .limit(20);
    newsItems = data ?? [];
  } catch (error) {
    console.warn("Supabase not available for news page", error);
  }

  return (
    <div className="space-y-8">
      <section>
        <Card className="bg-black/20">
          <CardHeader>
            <CardTitle>AI 新闻信号</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/60">
              这里汇总配置来源抓取的最新 AI 相关头条。将其与关键词建立关联，以丰富编辑洞察。
            </p>
          </CardContent>
        </Card>
      </section>
      <section>
        <div className="grid gap-4">
          {newsItems.length === 0 ? (
            <Card className="bg-black/15">
              <CardContent>
                <p className="text-sm text-white/60">暂无新闻内容。连接 RSS、Twitter 或 Webhook 来源即可开始填充。</p>
              </CardContent>
            </Card>
          ) : (
            newsItems.map((item) => (
              <Card key={item.id} className="bg-black/15">
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-base font-semibold text-white hover:underline">
                      {item.title}
                    </a>
                    <span className="text-xs text-white/50">{item.source ?? "来源未知"}</span>
                  </div>
                  {item.summary ? <p className="text-sm text-white/60">{item.summary}</p> : null}
                  <p className="text-xs text-white/40">
                    发布时间：{item.published_at ? new Date(item.published_at).toLocaleString("zh-CN") : "暂无"}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default NewsPage;
