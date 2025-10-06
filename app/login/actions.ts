"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE_SECONDS, ensureAdminConfig } from "@/lib/auth/config";

export type LoginState = {
  error?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const login = async (_prevState: LoginState | undefined, formData: FormData): Promise<LoginState> => {
  const username = `${formData.get("username") ?? ""}`.trim();
  const password = `${formData.get("password") ?? ""}`;

  const config = ensureAdminConfig();

  if (!username || !password) {
    return { error: "请输入账号和密码" };
  }

  const isValid = username === config.username && password === config.password;

  if (!isValid) {
    await sleep(400);
    return { error: "账号或密码错误" };
  }

  const cookieJar = await cookies();

  cookieJar.set({
    name: ADMIN_SESSION_COOKIE,
    value: config.secret,
    httpOnly: true,
    secure: true,
    path: "/",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });

  redirect("/overview");
};
