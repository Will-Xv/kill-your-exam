import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createSession, getSessionUser } from "@/lib/auth";
import { exchangeCode, fetchUserInfo } from "@/lib/googleAuth";

function uniqueUsername(base) {
  let name = (base || "user").replace(/[^A-Za-z0-9_]/g, "").slice(0, 16) || "user";
  if (name.length < 2) name = "user" + name;
  let candidate = name, i = 0;
  while (db.prepare("SELECT id FROM users WHERE username=?").get(candidate)) {
    i += 1; candidate = (name.slice(0, 14) + i);
  }
  return candidate;
}

function setSession(res, userId) {
  const token = createSession(userId);
  res.cookies.set("beikao_session", token, { httpOnly: true, maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
}

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("g_oauth_state")?.value;
  const home = new URL("/", req.url);

  if (url.searchParams.get("error")) return NextResponse.redirect(new URL("/login?err=google_denied", req.url));
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/login?err=google_state", req.url));
  }
  const bind = state.split(".")[1] === "1";

  let profile;
  try {
    const tokens = await exchangeCode(req, code);
    profile = await fetchUserInfo(tokens.access_token);
  } catch {
    return NextResponse.redirect(new URL("/login?err=google_exchange", req.url));
  }
  const sub = profile.sub;
  const email = (profile.email || "").toLowerCase();
  if (!sub) return NextResponse.redirect(new URL("/login?err=google_nosub", req.url));

  // 绑定到当前已登录账号
  if (bind) {
    const current = await getSessionUser();
    if (current) {
      const taken = db.prepare("SELECT id FROM users WHERE google_sub=? AND id!=?").get(sub, current.id);
      if (taken) return NextResponse.redirect(new URL("/settings?bind=taken", req.url));
      db.prepare("UPDATE users SET google_sub=?, email=COALESCE(email,?), name=COALESCE(name,?), avatar_url=? WHERE id=?")
        .run(sub, email || null, profile.name || null, profile.picture || null, current.id);
      const res = NextResponse.redirect(new URL("/settings?bind=ok", req.url));
      res.cookies.delete("g_oauth_state");
      return res;
    }
  }

  // 已用该 Google 账号登记过
  let user = db.prepare("SELECT * FROM users WHERE google_sub=? AND deleted_at IS NULL").get(sub);
  // 或已有同邮箱的本地账号 -> 自动关联
  if (!user && email) {
    const byEmail = db.prepare("SELECT * FROM users WHERE lower(email)=? AND deleted_at IS NULL").get(email);
    if (byEmail) {
      db.prepare("UPDATE users SET google_sub=?, name=COALESCE(name,?), avatar_url=? WHERE id=?")
        .run(sub, profile.name || null, profile.picture || null, byEmail.id);
      user = byEmail;
    }
  }
  // 新用户:自动创建(测试模式下仅授权的测试用户能走到这一步)
  if (!user) {
    const isFirst = db.prepare("SELECT COUNT(*) n FROM users").get().n === 0;
    const username = uniqueUsername(email.split("@")[0] || profile.name);
    const info = db.prepare(
      "INSERT INTO users(username,password_hash,salt,is_admin,is_developer,lang,google_sub,email,name,avatar_url) VALUES(?,?,?,?,0,?,?,?,?,?)"
    ).run(username, "", "", isFirst ? 1 : 0, "en", sub, email || null, profile.name || null, profile.picture || null);
    user = db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  }
  if (user.deleted_at) return NextResponse.redirect(new URL("/login?err=account_deleted", req.url));

  const res = NextResponse.redirect(home);
  res.cookies.delete("g_oauth_state");
  setSession(res, user.id);
  return res;
}
