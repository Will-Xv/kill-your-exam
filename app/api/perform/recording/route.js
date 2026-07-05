import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { readRec } from "@/lib/files";

export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const id = Number(new URL(req.url).searchParams.get("attemptId"));
  const a = db.prepare("SELECT a.id FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND e.user_id=?").get(id, user.id);
  if (!a) return new Response("not found", { status: 404 });
  const buf = readRec(id);
  if (!buf) return new Response("no recording", { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=600" } });
}
