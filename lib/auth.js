import crypto from "crypto";
import { cookies } from "next/headers";
import db, { getActiveExam } from "./db";

export function hashPassword(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString("hex") };
}
export function verifyPassword(pw, salt, hash) {
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), crypto.scryptSync(pw, salt, 64));
  } catch { return false; }
}
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+365 days'))").run(token, userId);
  return token;
}
export async function setSessionCookie(token) {
  const c = await cookies();
  c.set("beikao_session", token, { httpOnly: true, maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
}
export async function getSessionUser() {
  const c = await cookies();
  const t = c.get("beikao_session")?.value;
  if (!t) return null;
  return db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at > datetime('now')`).get(t) || null;
}
// 路由统一入口:返回 { user, exam };user 为空时调用方应返回 401
export async function requireUser() {
  const user = await getSessionUser();
  return { user, exam: user ? getActiveExam(user.id) : null };
}
export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
export const forbidden = () => Response.json({ error: "forbidden" }, { status: 403 });
