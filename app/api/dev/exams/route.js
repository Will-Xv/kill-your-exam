import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  const exams = db.prepare("SELECT id, name, status, deleted_at, user_id FROM exams ORDER BY id").all();
  const rows = exams.map((e) => ({
    id: e.id, name: e.name, status: e.status, deleted: !!e.deleted_at, userId: e.user_id,
    attempts: db.prepare("SELECT COUNT(*) n FROM attempts WHERE exam_id=?").get(e.id).n,
    materials: db.prepare("SELECT COUNT(*) n FROM materials WHERE exam_id=?").get(e.id).n,
    kps: db.prepare("SELECT COUNT(*) n FROM knowledge_points WHERE exam_id=?").get(e.id).n,
    questions: db.prepare("SELECT COUNT(*) n FROM questions WHERE exam_id=?").get(e.id).n,
    chats: db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE exam_id=?").get(e.id).n
  }));
  return Response.json({ exams: rows });
}
