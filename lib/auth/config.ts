import { env } from "@/lib/env";

export const ADMIN_SESSION_COOKIE = "ai-trends-admin";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export type AdminConfig = {
  username: string;
  password: string;
  secret: string;
};

export const resolveAdminConfig = (): AdminConfig | null => {
  const username = env.AI_TRENDS_ADMIN_USERNAME?.trim();
  const password = env.AI_TRENDS_ADMIN_PASSWORD;
  const secret = env.AI_TRENDS_SESSION_SECRET;

  if (!username || !password || !secret) {
    return null;
  }

  return { username, password, secret };
};

export const ensureAdminConfig = (): AdminConfig => {
  const config = resolveAdminConfig();
  if (!config) {
    throw new Error(
      "管理员账号未配置，请在环境变量中设置 AI_TRENDS_ADMIN_USERNAME、AI_TRENDS_ADMIN_PASSWORD 与 AI_TRENDS_SESSION_SECRET。"
    );
  }

  return config;
};

export const isAdminConfigured = () => resolveAdminConfig() !== null;
