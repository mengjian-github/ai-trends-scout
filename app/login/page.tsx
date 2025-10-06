import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { ADMIN_SESSION_COOKIE, resolveAdminConfig } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

const LoginPage = async () => {
  const config = resolveAdminConfig();

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 px-6 py-8 text-white">
        <div className="max-w-md space-y-4 rounded-2xl border border-white/10 bg-black/60 p-8 text-center">
          <h1 className="text-xl font-semibold">管理员账号未配置</h1>
          <p className="text-sm text-white/70">
            请设置环境变量 <code className="rounded bg-white/10 px-2 py-1 text-xs">AI_TRENDS_ADMIN_USERNAME</code>、
            <code className="rounded bg-white/10 px-2 py-1 text-xs">AI_TRENDS_ADMIN_PASSWORD</code> 以及
            <code className="rounded bg-white/10 px-2 py-1 text-xs">AI_TRENDS_SESSION_SECRET</code> 后重新部署。
          </p>
        </div>
      </div>
    );
  }

  const cookieStore = await cookies();
  const existingSession = cookieStore.get(ADMIN_SESSION_COOKIE);
  if (existingSession?.value === config.secret) {
    redirect("/overview");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 px-6 py-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-white/10 bg-black/60 p-8 text-white shadow-xl">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">AI 趋势侦察</h1>
          <p className="text-sm text-white/70">内部使用 · 仅限管理员访问</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
};

export default LoginPage;
