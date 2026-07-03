import db from "@/lib/db";
import { cookies } from "next/headers";
export async function POST() {
  const c = await cookies();
  const t = c.get("beikao_session")?.value;
  if (t) db.prepare("DELETE FROM sessions WHERE token=?").run(t);
  c.delete("beikao_session");
  return Response.json({ ok: true });
}
