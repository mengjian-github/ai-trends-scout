import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { refreshGameKeywords } from "@/lib/services/game-keywords";
import type { GameKeywordProgressUpdate } from "@/lib/services/game-keywords";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const POST = async (request: NextRequest) => {
  const token = env.AI_TRENDS_CALLBACK_TOKEN ?? env.AI_TRENDS_SYNC_TOKEN ?? null;
  if (token) {
    const authorization = request.headers.get("authorization");
    if (!authorization || authorization !== `Bearer ${token}`) {
      return unauthorized();
    }
  }

  const shouldPersist = request.nextUrl.searchParams.get("persist") === "true";

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  let pendingWrite = Promise.resolve();
  const enqueue = (payload: unknown) => {
    const serialized = JSON.stringify(payload);
    pendingWrite = pendingWrite.then(() => writer.write(encoder.encode(`${serialized}\n`))).catch(() => undefined);
  };

  (async () => {
    try {
      const result = await refreshGameKeywords(
        { shouldPersist },
        (update: GameKeywordProgressUpdate) => {
          enqueue({ type: "progress", data: update });
        }
      );

      enqueue({ type: "complete", data: result });
    } catch (error) {
      const message = (error as Error).message ?? "Failed to refresh game keywords";
      enqueue({ type: "error", message });
    } finally {
      await pendingWrite.catch(() => undefined);
      writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};
