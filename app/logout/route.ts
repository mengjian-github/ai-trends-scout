import { NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

const clearSession = (response: NextResponse) => {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
};

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  clearSession(response);
  return response;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  clearSession(response);
  return response;
}
