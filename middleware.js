import { NextResponse } from "next/server";

const PUBLIC = ["/login", "/favicon.ico", "/manifest.webmanifest", "/sw.js"];

export function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname) || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/ingest") || pathname.startsWith("/api/agent") || pathname.startsWith("/api/browser/poll") || pathname.startsWith("/api/browser/update") || pathname.startsWith("/_next") || pathname.startsWith("/icon-") || pathname.startsWith("/fonts/") || /\.[a-zA-Z0-9]+$/.test(pathname)) {
    return NextResponse.next();
  }
  const ok = !!req.cookies.get("beikao_session")?.value;
  if (!ok) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
