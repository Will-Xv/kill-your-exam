import crypto from "crypto";
import { NextResponse } from "next/server";
import { authUrl, getOrigin } from "@/lib/googleAuth";

export async function GET(req) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.redirect(new URL("/login?err=google_not_configured", getOrigin(req)));
  }
  const url = new URL(req.url);
  const bind = url.searchParams.get("bind") === "1" ? "1" : "0";
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = `${nonce}.${bind}`;
  const res = NextResponse.redirect(authUrl(req, state));
  res.cookies.set("g_oauth_state", state, { httpOnly: true, maxAge: 600, sameSite: "lax", path: "/" });
  return res;
}
