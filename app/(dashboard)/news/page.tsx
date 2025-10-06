export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TriggerNewsIngestButton } from "@/components/news/trigger-ingest-button";
import { NewsList } from "@/components/news/news-list";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { NewsItem } from "@/types/news";

const NewsPage = async () => {
  let newsItems: NewsItem[] = [];

  try {
    const client = getSupabaseAdmin();
    const { data } = await client
      .from("ai_trends_news")
      .select("id, title, url, source, published_at, summary")
      .order("published_at", { ascending: false })
      .limit(200);
    newsItems = (data ?? []) as NewsItem[];
  } catch (error) {
    console.warn("Supabase not available for news page", error);
  }

  return (
    <div className="space-y-8">
      <section className="flex justify-end">
        <TriggerNewsIngestButton />
      </section>
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
        <NewsList items={newsItems} />
      </section>
    </div>
  );
};

export default NewsPage;

