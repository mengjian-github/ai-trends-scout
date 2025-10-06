import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE } from "@/lib/auth/config";

const PUBLIC_PATH_PREFIXES = ["/_next", "/static", "/favicon.ico", "/login", "/api", "/logout", "/robots.txt", "/sitemap.xml"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath = PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (isPublicPath) {
    return NextResponse.next();
  }

  const username = process.env.AI_TRENDS_ADMIN_USERNAME;
  const password = process.env.AI_TRENDS_ADMIN_PASSWORD;
  const secret = process.env.AI_TRENDS_SESSION_SECRET;

  if (!username || !password || !secret) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const session = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (session === secret) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
};
