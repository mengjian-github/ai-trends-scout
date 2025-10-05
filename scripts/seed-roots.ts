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
  { label: "AI Tools", keyword: "ai tools" },
  { label: "Best AI Tools", keyword: "best ai tools" },
  { label: "New AI Tools", keyword: "new ai tools" },
  { label: "AI Tool Directory", keyword: "ai tool directory" },
  { label: "AI Productivity Tools", keyword: "ai productivity tools" },
  { label: "AI Writing Tool", keyword: "ai writing tool" },
  { label: "AI Image Generator", keyword: "ai image generator" },
  { label: "AI Video Generator", keyword: "ai video generator" },
  { label: "AI Voice Generator", keyword: "ai voice generator" },
  { label: "AI Chatbot", keyword: "ai chatbot" },
  { label: "AI Automation Tool", keyword: "ai automation tool" },
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
