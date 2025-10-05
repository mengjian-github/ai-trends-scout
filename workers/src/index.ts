/// <reference types="@cloudflare/workers-types" />

interface Env {
  VERCEL_SYNC_URL: string;
  VERCEL_SYNC_TOKEN?: string;
}

const buildHeaders = (env: Env) => {
  const headers = new Headers();
  if (env.VERCEL_SYNC_TOKEN) {
    headers.set("Authorization", `Bearer ${env.VERCEL_SYNC_TOKEN}`);
  }
  return headers;
};

const handleSync = async (env: Env) => {
  if (!env.VERCEL_SYNC_URL) {
    return new Response(JSON.stringify({ error: "Missing VERCEL_SYNC_URL" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(env.VERCEL_SYNC_URL, {
      method: "POST",
      headers: buildHeaders(env),
    });

    const body = await response.text();
    const contentType = response.headers.get("content-type") ?? "application/json";

    return new Response(body || JSON.stringify({ status: response.ok ? "ok" : "error" }), {
      status: response.status,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("Failed to trigger Vercel sync", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? "Failed to trigger Vercel sync" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
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
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(handleSync(env));
  },
};

export { handleSync };
export default worker;
