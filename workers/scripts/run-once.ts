import path from "node:path";
import process from "node:process";
import { config } from "dotenv";
import { handleSync } from "../src/index";
import { ProxyAgent, setGlobalDispatcher } from "undici";

const envPath = path.resolve(process.cwd(), ".env.local");
config({ path: envPath });

const proxyUrl =
  process.env.HTTPS_PROXY ??
  process.env.https_proxy ??
  process.env.HTTP_PROXY ??
  process.env.http_proxy ??
  process.env.ALL_PROXY ??
  process.env.all_proxy;

if (proxyUrl) {
  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  } catch (error) {
    console.warn("Failed to configure proxy for worker run", error);
  }
}

const requiredVars: Array<keyof NodeJS.ProcessEnv> = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "DATAFORSEO_LOGIN",
  "DATAFORSEO_PASSWORD",
];

const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error("Missing required env vars:", missing.join(", "));
  process.exit(1);
}

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL!,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN!,
  DATAFORSEO_LOGIN: process.env.DATAFORSEO_LOGIN!,
  DATAFORSEO_PASSWORD: process.env.DATAFORSEO_PASSWORD!,
  DATAFORSEO_BASE_URL: process.env.DATAFORSEO_BASE_URL,
  AI_TRENDS_DEVELOPED_MARKETS: process.env.AI_TRENDS_DEVELOPED_MARKETS,
  AI_TRENDS_TIMEFRAMES: process.env.AI_TRENDS_TIMEFRAMES,
  BASELINE_KEYWORD: process.env.AI_TRENDS_BASELINE_KEYWORD ?? process.env.BASELINE_KEYWORD,
} satisfies Parameters<typeof handleSync>[0];

(async () => {
  try {
    const response = await handleSync(env);
    const text = await response.text();
    console.log("Worker sync status:", response.status);
    console.log(text);
  } catch (error) {
    console.error("Worker sync failed", error);
    process.exitCode = 1;
  }
})();
