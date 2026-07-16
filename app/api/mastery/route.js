import db from "@/lib/db";

import { requireUser, unauthorized } from "@/lib/auth";
import { masteryMatrix } from "@/lib/mastery";
import { setReqUser } from "@/lib/reqctx";
export async function GET() {
  const { user, exam } = await requireUser();
    if (user) setReqUser(user.id);
  if (!user) return unauthorized();
  if (!exam) return Response.json({ matrix: [], insights: [] });
  const insights = db.prepare("SELECT id, kind, text, created_at FROM insights WHERE exam_id=? ORDER BY id DESC LIMIT 30").all(exam.id);
  return Response.json({ matrix: masteryMatrix(exam.id), insights });
}
