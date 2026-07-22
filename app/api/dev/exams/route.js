import db, { familyScope } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  const exams = db.prepare("SELECT id, name, status, deleted_at, user_id, parent_exam_id, completed_at FROM exams ORDER BY id").all();
  const rows = exams.map((e) => ({
    id: e.id, name: e.name, status: e.status, deleted: !!e.deleted_at, userId: e.user_id,
    // 【排查资料共享用】父子关系是资料/RAG 共享的唯一依据(familyScope 只认 parent_exam_id);
    // family 是系统【实际解析出来】的家族成员 id —— 若某门课的 family 只有它自己,就说明父子没建立,
    // 那么"资料不共享"是必然结果,而不是资料模块的 bug。completed 只是个标记,不参与作用域。
    parentId: e.parent_exam_id || null,
    completed: !!e.completed_at,
    family: (() => { try { return familyScope(e.id); } catch { return []; } })(),
    attempts: db.prepare("SELECT COUNT(*) n FROM attempts WHERE exam_id=?").get(e.id).n,
    materials: db.prepare("SELECT COUNT(*) n FROM materials WHERE exam_id=?").get(e.id).n,
    kps: db.prepare("SELECT COUNT(*) n FROM knowledge_points WHERE exam_id=?").get(e.id).n,
    questions: db.prepare("SELECT COUNT(*) n FROM questions WHERE exam_id=?").get(e.id).n,
    chats: db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE exam_id=?").get(e.id).n
  }));
  return Response.json({ exams: rows });
}
