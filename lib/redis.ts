import "@/lib/server-proxy";
import { Redis } from "@upstash/redis";
import { env } from "./env";

let redisClient: Redis | undefined;

export const getRedis = () => {
  if (!redisClient) {
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error("Redis credentials are not configured");
    }

    redisClient = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  return redisClient;
};

export const redisKeys = {
  overview: "ats:overview",
  metrics: "ats:metrics",
  hotlist: (timeframe: string) => `ats:hotlist:${timeframe}`,
  keyword: (keywordId: string) => `ats:keyword:${keywordId}`,
};
