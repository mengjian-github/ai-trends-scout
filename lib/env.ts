import { z } from "zod";

const DEFAULT_NEWS_FEEDS = [
  "https://techcrunch.com/category/artificial-intelligence/feed/",
  "https://arstechnica.com/ai/feed/",
  "https://aiscoop.com/feed/",
  "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss",
  "https://www.artificialintelligence-news.com/feed/",
  "https://www.zdnet.com/topic/artificial-intelligence/rss.xml",
  "https://www.marktechpost.com/feed/",
  "https://www.theregister.com/software/ai/headlines.atom",
  "https://siliconangle.com/category/emergent-tech/artificial-intelligence/feed/",
  "https://decrypt.co/feed/ai",
];

const baseSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_JWT_SECRET: z.string().optional(),
    POSTGRES_URL: z.string().optional(),
    POSTGRES_URL_NON_POOLING: z.string().optional(),
    POSTGRES_PRISMA_URL: z.string().optional(),
    POSTGRES_DATABASE: z.string().optional(),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_HOST: z.string().optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    UPSTASH_REDIS_REST_READ_ONLY_TOKEN: z.string().optional(),
    KV_URL: z.string().optional(),
    REDIS_URL: z.string().optional(),
    DATAFORSEO_LOGIN: z.string().optional(),
    DATAFORSEO_PASSWORD: z.string().optional(),
    DATAFORSEO_BASE_URL: z.string().url().optional().default("https://api.dataforseo.com/v3"),
    AI_TRENDS_DEVELOPED_MARKETS: z
      .string()
      .optional()
      .default("global"),
    AI_TRENDS_TIMEFRAMES: z
      .string()
      .optional()
      .default("past_7_days"),
    AI_TRENDS_SYNC_TOKEN: z.string().optional(),
    AI_TRENDS_CALLBACK_TOKEN: z.string().optional(),
    AI_TRENDS_NEWS_FEEDS: z.string().optional(),
    AI_TRENDS_NEWS_MAX_ITEMS: z.string().optional(),
  })
  .transform((values) => ({
    ...values,
    AI_TRENDS_DEVELOPED_MARKETS_LIST: values.AI_TRENDS_DEVELOPED_MARKETS?.split(",").map((item) => item.trim()).filter(Boolean) ?? [],
    AI_TRENDS_TIMEFRAMES_LIST: values.AI_TRENDS_TIMEFRAMES?.split(",").map((item) => item.trim()).filter(Boolean) ?? [],
    AI_TRENDS_NEWS_FEEDS_LIST:
      values.AI_TRENDS_NEWS_FEEDS?.split(",").map((item) => item.trim()).filter(Boolean) ?? DEFAULT_NEWS_FEEDS,
    AI_TRENDS_NEWS_MAX_ITEMS_NUMBER: (() => {
      const raw = values.AI_TRENDS_NEWS_MAX_ITEMS;
      if (!raw) {
        return null;
      }

      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    })(),
  }));

export type AppEnv = z.infer<typeof baseSchema>;

export const env = baseSchema.parse(process.env);

export const requiredServerEnv = () => {
  const missing: string[] = [];
  const requiredKeys: Array<keyof AppEnv> = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "DATAFORSEO_LOGIN",
    "DATAFORSEO_PASSWORD",
  ];

  for (const key of requiredKeys) {
    const value = env[key];
    if (!value) {
      missing.push(key as string);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required server env vars: ${missing.join(", ")}`);
  }

  return env;
};

export const developedMarkets = env.AI_TRENDS_DEVELOPED_MARKETS_LIST as string[];
export const trendTimeframes = env.AI_TRENDS_TIMEFRAMES_LIST as string[];
export const newsFeedUrls = env.AI_TRENDS_NEWS_FEEDS_LIST as string[];
export const newsMaxItems = env.AI_TRENDS_NEWS_MAX_ITEMS_NUMBER as number | null;
