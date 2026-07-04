import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";

// 当前用户的所有考试 + 数据量(帮判断哪个该保留),并可删除指定考试
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const exams = db.prepare("SELECT id, name, status, deleted_at FROM exams WHERE user_id=? ORDER BY id").all(u.id);
  const rows = exams.map((e) => ({
    id: e.id, name: e.name, status: e.status, deleted: !!e.deleted_at,
    attempts: db.prepare("SELECT COUNT(*) n FROM attempts WHERE exam_id=?").get(e.id).n,
    materials: db.prepare("SELECT COUNT(*) n FROM materials WHERE exam_id=?").get(e.id).n,
    kps: db.prepare("SELECT COUNT(*) n FROM knowledge_points WHERE exam_id=?").get(e.id).n,
    questions: db.prepare("SELECT COUNT(*) n FROM questions WHERE exam_id=?").get(e.id).n,
    chats: db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE exam_id=?").get(e.id).n
  }));
  return Response.json({ exams: rows });
}
