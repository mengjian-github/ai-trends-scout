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

const env: Parameters<typeof handleSync>[0] = {
  VERCEL_SYNC_URL: process.env.VERCEL_SYNC_URL ?? "",
  VERCEL_SYNC_TOKEN: process.env.VERCEL_SYNC_TOKEN,
};

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
