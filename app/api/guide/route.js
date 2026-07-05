import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { GUIDE_VERSION } from "@/lib/guide";

export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { type } = await req.json().catch(() => ({}));
  if (type === "tour") db.prepare("UPDATE users SET onboarded=1, guide_version=? WHERE id=?").run(GUIDE_VERSION, u.id);
  else if (type === "whatsnew") db.prepare("UPDATE users SET guide_version=?, onboarded=1 WHERE id=?").run(GUIDE_VERSION, u.id);
  return Response.json({ ok: true });
}
