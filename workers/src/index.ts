/// <reference types="@cloudflare/workers-types" />

interface Env {
  VERCEL_SYNC_URL?: string;
  VERCEL_SYNC_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TASK_RETENTION_DAYS?: string;
}

const buildHeaders = (env: Env) => {
  const headers = new Headers();
  if (env.VERCEL_SYNC_TOKEN) {
    headers.set("Authorization", `Bearer ${env.VERCEL_SYNC_TOKEN}`);
  }
  return headers;
};

const DEFAULT_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 90;

const parseRetentionDays = (env: Env) => {
  const raw = env.TASK_RETENTION_DAYS;
  if (!raw) {
    return DEFAULT_RETENTION_DAYS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RETENTION_DAYS;
  }

  return Math.min(parsed, MAX_RETENTION_DAYS);
};

type VercelResult =
  | { status: "skipped"; reason: string }
  | { status: "success"; httpStatus: number; ok: boolean; body: string; contentType: string }
  | { status: "error"; error: string };

const triggerVercelSync = async (env: Env): Promise<VercelResult> => {
  if (!env.VERCEL_SYNC_URL) {
    return { status: "skipped", reason: "Missing VERCEL_SYNC_URL" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("Request timed out"), 45_000);

    try {
      const response = await fetch(env.VERCEL_SYNC_URL, {
        method: "POST",
        headers: buildHeaders(env),
        signal: controller.signal,
      });

      const body = await response.text();
      const contentType = response.headers.get("content-type") ?? "application/json";

      return {
        status: "success",
        httpStatus: response.status,
        ok: response.ok,
        body: body || JSON.stringify({ status: response.ok ? "ok" : "error" }),
        contentType,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error("Failed to trigger Vercel sync", error);
    return {
      status: "error",
      error: (error as Error).message ?? "Failed to trigger Vercel sync",
    };
  }
};

type PruneResult =
  | { status: "skipped"; reason: string; retentionDays: number }
  | { status: "success"; retentionDays: number; deleted: number }
  | { status: "error"; retentionDays: number; error: string };

const pruneTaskDetails = async (env: Env): Promise<PruneResult> => {
  const retentionDays = parseRetentionDays(env);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      status: "error",
      retentionDays,
      error: "Missing Supabase configuration",
    };
  }

  try {
    const endpoint = new URL("/rest/v1/rpc/prune_ai_trends_tasks", env.SUPABASE_URL);
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ retention_days: retentionDays }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Supabase responded with ${response.status}: ${text}`);
    }

    let deleted = 0;
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === "number") {
          deleted = parsed;
        } else if (parsed && typeof parsed.prune_ai_trends_tasks === "number") {
          deleted = parsed.prune_ai_trends_tasks;
        } else if (Array.isArray(parsed) && typeof parsed[0]?.prune_ai_trends_tasks === "number") {
          deleted = parsed[0].prune_ai_trends_tasks;
        }
      } catch (parseError) {
        const fallback = Number.parseInt(text, 10);
        if (Number.isFinite(fallback)) {
          deleted = fallback;
        } else {
          console.warn("Unexpected prune payload", parseError, text);
        }
      }
    }

    return {
      status: "success",
      retentionDays,
      deleted,
    };
  } catch (error) {
    console.error("Failed to prune ai_trends_tasks", error);
    return {
      status: "error",
      retentionDays,
      error: (error as Error).message ?? "Failed to prune ai_trends_tasks",
    };
  }
};

const handleSync = async (env: Env) => {
  const [vercel, taskPrune] = await Promise.all([triggerVercelSync(env), pruneTaskDetails(env)]);

  const hasError =
    vercel.status === "error" ||
    taskPrune.status === "error" ||
    (vercel.status === "skipped" && vercel.reason.includes("Missing")) ||
    (taskPrune.status === "skipped" && taskPrune.reason.includes("Missing"));

  return new Response(
    JSON.stringify({
      status: hasError ? "error" : "ok",
      vercel,
      taskPrune,
    }),
    {
      status: hasError ? 500 : 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    if (request.method === "POST") {
      return handleSync(env);
    }

    return new Response("AI Trends Scout worker", {
      headers: { "Content-Type": "text/plain" },
    });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleSync(env));
  },
};

export { handleSync };
export default worker;
