import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  let profile = {};
  try { profile = JSON.parse(u.profile_json || "{}"); } catch {}
  return Response.json({ profile });
}
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { profile } = await req.json();
  db.prepare("UPDATE users SET profile_json=? WHERE id=?").run(JSON.stringify(profile || {}), u.id);
  return Response.json({ ok: true });
}
