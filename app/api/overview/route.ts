import { NextResponse } from "next/server";
import { resolveOverviewPayload } from "@/lib/services/overview";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = async () => {
  const payload = await resolveOverviewPayload();
  return NextResponse.json(payload);
};
