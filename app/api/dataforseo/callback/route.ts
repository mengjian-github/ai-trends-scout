import { gunzipSync } from "node:zlib";

import { NextRequest, NextResponse } from "next/server";

import { env, requiredServerEnv } from "@/lib/env";
import { processDataForSeoCallback, type DataForSeoCallbackPayload } from "@/lib/services/trends-ingest";

export const runtime = "nodejs";

const isAuthorized = (request: NextRequest) => {
  if (!env.AI_TRENDS_CALLBACK_TOKEN) {
    return true;
  }

  const token = request.nextUrl.searchParams.get("token");
  return token === env.AI_TRENDS_CALLBACK_TOKEN;
};

const parseRequestBody = async (request: NextRequest) => {
  const contentEncoding = request.headers.get("content-encoding")?.toLowerCase();
  const buffer = Buffer.from(await request.arrayBuffer());

  console.log("DataForSEO callback raw body", {
    contentEncoding: contentEncoding ?? null,
    size: buffer.length,
    preview: buffer.slice(0, 1024).toString("utf-8"),
  });

  if (!buffer.length) {
    return {} as DataForSeoCallbackPayload;
  }

  const decoded = contentEncoding === "gzip" ? gunzipSync(buffer) : buffer;
  const text = decoded.toString("utf-8").trim();

  console.log("DataForSEO callback decoded payload", {
    size: decoded.length,
    preview: text.slice(0, 2048),
  });

  if (!text) {
    return {} as DataForSeoCallbackPayload;
  }

  return JSON.parse(text) as DataForSeoCallbackPayload;
};

export async function POST(request: NextRequest) {
  try {
    requiredServerEnv();
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  if (!isAuthorized(request)) {
    console.warn("DataForSEO callback unauthorized", {
      url: request.nextUrl.href,
      hasToken: request.nextUrl.searchParams.has("token"),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: DataForSeoCallbackPayload;

  try {
    payload = await parseRequestBody(request);
  } catch (error) {
    console.error("Failed to parse callback payload", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  console.log("Processing DataForSEO callback payload", {
    statusCode: payload.status_code ?? null,
    taskCount: payload.tasks?.length ?? 0,
  });

  try {
    const result = await processDataForSeoCallback(payload);
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    console.error("Failed to process DataForSEO callback", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
