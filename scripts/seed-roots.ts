import path from "node:path";
import process from "node:process";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

type SeedRoot = {
  label: string;
  keyword: string;
  locales?: string[];
};

const envPath = path.resolve(process.cwd(), ".env.local");
config({ path: envPath });

const requiredVars: Array<keyof NodeJS.ProcessEnv> = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error("Missing required env vars:", missing.join(", "));
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const seedRoots: SeedRoot[] = [
  { label: "AI 生成 · generator", keyword: "generator" },
  { label: "AI 生成 · creator", keyword: "creator" },
  { label: "AI 生成 · maker", keyword: "maker" },
  { label: "AI 生成 · builder", keyword: "builder" },
  { label: "AI 生成 · constructor", keyword: "constructor" },
  { label: "AI 生成 · composer", keyword: "composer" },
  { label: "AI 助手工具 · helper", keyword: "helper" },
  { label: "AI 助手工具 · assistant", keyword: "assistant" },
  { label: "AI 助手工具 · agent", keyword: "agent" },
  { label: "AI 助手工具 · advisor", keyword: "advisor" },
  { label: "AI 工具 · tool", keyword: "tool" },
  { label: "导航站 · directory", keyword: "directory" },
  { label: "导航站 · top", keyword: "top" },
  { label: "导航站 · best", keyword: "best" },
  { label: "导航站 · list", keyword: "list" },
  { label: "导航站 · portal", keyword: "portal" },
  { label: "导航站 · finder", keyword: "finder" },
  { label: "模板资源 · example", keyword: "example" },
  { label: "模板资源 · template", keyword: "template" },
  { label: "模板资源 · sample", keyword: "sample" },
  { label: "模板资源 · pattern", keyword: "pattern" },
  { label: "模板资源 · resources", keyword: "resources" },
  { label: "模板资源 · guide", keyword: "guide" },
  { label: "模板资源 · format", keyword: "format" },
  { label: "模板资源 · model", keyword: "model" },
  { label: "模板资源 · layout", keyword: "layout" },
  { label: "模板资源 · ideas", keyword: "ideas" },
  { label: "模板资源 · starter", keyword: "starter" },
  { label: "目录导航 · cataloger", keyword: "cataloger" },
  { label: "模板资源 · dashboard", keyword: "dashboard" },
  { label: "设计工具 · designer", keyword: "designer" },
  { label: "数据流动 · uploader", keyword: "uploader" },
  { label: "数据流动 · downloader", keyword: "downloader" },
  { label: "数据流动 · scraper", keyword: "scraper" },
  { label: "数据流动 · crawler", keyword: "crawler" },
  { label: "数据流动 · syncer", keyword: "syncer" },
  { label: "转换工具 · translator", keyword: "translator" },
  { label: "转换工具 · converter", keyword: "converter" },
  { label: "编辑优化工具 · editor", keyword: "editor" },
  { label: "编辑优化工具 · optimizer", keyword: "optimizer" },
  { label: "编辑优化工具 · enhancer", keyword: "enhancer" },
  { label: "编辑优化工具 · modifier", keyword: "modifier" },
  { label: "编辑优化工具 · processor", keyword: "processor" },
  { label: "评估分析工具 · compiler", keyword: "compiler" },
  { label: "评估分析工具 · analyzer", keyword: "analyzer" },
  { label: "评估分析工具 · evaluator", keyword: "evaluator" },
  { label: "计算工具 · calculator", keyword: "calculator" },
  { label: "在线工具 · online", keyword: "online" },
  { label: "AI 检测工具 · checker", keyword: "checker" },
  { label: "AI 检测工具 · detector", keyword: "detector" },
  { label: "AI 检测工具 · humanizer", keyword: "humanizer" },
  { label: "AI 检测工具 · tester", keyword: "tester" },
  { label: "规划管理工具 · planner", keyword: "planner" },
  { label: "规划管理工具 · scheduler", keyword: "scheduler" },
  { label: "规划管理工具 · manager", keyword: "manager" },
  { label: "规划管理工具 · tracker", keyword: "tracker" },
  { label: "数据发送接收 · sender", keyword: "sender" },
  { label: "数据发送接收 · receiver", keyword: "receiver" },
  { label: "数据发送接收 · responder", keyword: "responder" },
  { label: "录屏录音工具 · recorder", keyword: "recorder" },
  { label: "连接工具 · connector", keyword: "connector" },
  { label: "文件查看 · viewer", keyword: "viewer" },
  { label: "数据监控查看 · monitor", keyword: "monitor" },
  { label: "信息查看 · notifier", keyword: "notifier" },
  { label: "信息验证 · verifier", keyword: "verifier" },
  { label: "游戏工具 · simulator", keyword: "simulator" },
  { label: "比较工具 · comparator", keyword: "comparator" },
  { label: "游戏站 · answer", keyword: "answer" },
  { label: "游戏站 · hint", keyword: "hint" },
  { label: "游戏站 · clue", keyword: "clue" },
  { label: "游戏站 · cheat", keyword: "cheat" },
  { label: "游戏站 · solver", keyword: "solver" },
  { label: "文字工具 · extractor", keyword: "extractor" },
  { label: "文字工具 · summarizer", keyword: "summarizer" },
  { label: "文字工具 · transcriber", keyword: "transcriber" },
  { label: "文字工具 · paraphraser", keyword: "paraphraser" },
  { label: "文字工具 · writer", keyword: "writer" },
  { label: "图片工具站 · image", keyword: "image" },
  { label: "图片工具站 · photo", keyword: "photo" },
  { label: "图片工具站 · picture", keyword: "picture" },
  { label: "图片工具站 · face", keyword: "face" },
  { label: "图片工具站 · emoji", keyword: "emoji" },
  { label: "图片工具站 · meme", keyword: "meme" },
  { label: "图片工具站 · chart", keyword: "chart" },
  { label: "图片工具站 · graph", keyword: "graph" },
  { label: "图片工具站 · style", keyword: "style" },
  { label: "图片工具站 · filter", keyword: "filter" },
  { label: "内容类型关键词 · text", keyword: "text" },
  { label: "内容类型关键词 · chat", keyword: "chat" },
  { label: "内容类型关键词 · code", keyword: "code" },
  { label: "内容类型关键词 · video", keyword: "video" },
  { label: "声音音乐工具站 · audio", keyword: "audio" },
  { label: "声音音乐工具站 · voice", keyword: "voice" },
  { label: "声音音乐工具站 · sound", keyword: "sound" },
  { label: "声音音乐工具站 · speech", keyword: "speech" },
  { label: "声音音乐工具站 · song", keyword: "song" },
  { label: "声音音乐工具站 · music", keyword: "music" },
  { label: "工具站 · how to", keyword: "how to" },
  { label: "图片工具站 · icon", keyword: "icon" },
  { label: "图片工具站 · logo", keyword: "logo" },
  { label: "图片工具站 · avatar", keyword: "avatar" },
  { label: "图片工具站 · anime", keyword: "anime" },
  { label: "图片工具站 · portrait", keyword: "portrait" },
  { label: "图片工具站 · product photo", keyword: "product photo" },
  { label: "图片工具站 · cartoon", keyword: "cartoon" },
  { label: "图片工具站 · tattoo", keyword: "tattoo" },
  { label: "图片工具站 · character", keyword: "character" },
  { label: "图片工具站 · coloring page", keyword: "coloring page" },
  { label: "图片工具站 · action", keyword: "action" },
  { label: "图片工具站 · figure", keyword: "figure" },
  { label: "图片工具站 · diagram", keyword: "diagram" },
  { label: "图片工具站 · font", keyword: "font" },
  { label: "图片工具站 · illustration", keyword: "illustration" },
  { label: "图片工具站 · interior design", keyword: "interior design" },
  { label: "图片工具站 · upscaler", keyword: "upscaler" }
];

(async () => {
  try {
    const records = seedRoots.flatMap((root) => {
      const locales = root.locales && root.locales.length > 0 ? root.locales : ["global"];
      return locales.map((locale) => ({
        label: root.label,
        keyword: root.keyword,
        locale,
      }));
    });

    const { data: existing, error: fetchError } = await supabase
      .from("ai_trends_roots")
      .select("keyword, locale");

    if (fetchError) {
      throw fetchError;
    }

    const existingSet = new Set((existing ?? []).map((row) => `${row.keyword.toLowerCase()}::${row.locale}`));

    const toInsert = records.filter((item) => !existingSet.has(`${item.keyword.toLowerCase()}::${item.locale}`));

    if (toInsert.length === 0) {
      console.log("No new roots to insert. Existing entries cover the seed set.");
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("ai_trends_roots")
      .insert(toInsert)
      .select("id, label, keyword, locale");

    if (insertError) {
      throw insertError;
    }

    console.log(`Inserted ${inserted?.length ?? 0} roots.`);
    (inserted ?? []).forEach((row) => {
      console.log(`- [${row.locale}] ${row.label} (${row.keyword})`);
    });
  } catch (error) {
    console.error("Seed failed", error);
    process.exitCode = 1;
  }
})();
