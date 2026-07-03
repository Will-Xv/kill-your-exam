import db from "@/lib/db";
import crypto from "crypto";
import { getSessionUser, unauthorized } from "@/lib/auth";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  let row = db.prepare("SELECT token FROM ingest_tokens WHERE user_id=?").get(u.id);
  if (!row) {
    const token = crypto.randomBytes(24).toString("hex");
    db.prepare("INSERT INTO ingest_tokens(token,user_id) VALUES(?,?)").run(token, u.id);
    row = { token };
  }
  return Response.json({ token: row.token });
}
export async function POST() {
  // 重置 token
  const u = await getSessionUser();
  if (!u) return unauthorized();
  db.prepare("DELETE FROM ingest_tokens WHERE user_id=?").run(u.id);
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO ingest_tokens(token,user_id) VALUES(?,?)").run(token, u.id);
  return Response.json({ token });
}
