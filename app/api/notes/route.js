import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

// 笔记本:用户手动添加的题目笔记 + 自由笔记。错题不会自动进来。
export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const rows = db.prepare(
    "SELECT * FROM notes WHERE user_id=? AND (exam_id IS ? OR exam_id=?) ORDER BY id DESC LIMIT 500"
  ).all(user.id, exam?.id ?? null, exam?.id ?? -1);
  const items = rows.map((n) => {
    let question = null;
    if (n.question_id) {
      const q = db.prepare("SELECT qtype, body, answer FROM questions WHERE id=?").get(n.question_id);
      if (q) {
        try { question = { qtype: q.qtype, body: JSON.parse(q.body), answer: JSON.parse(q.answer) }; } catch {}
      }
    }
    return { id: n.id, body: n.body, questionId: n.question_id, question, createdAt: n.created_at, updatedAt: n.updated_at };
  });
  return Response.json({ items });
}

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const { questionId, body } = await req.json();
  // 若已对该题记过笔记,则合并到已有那条(避免重复)
  if (questionId) {
    const ex = db.prepare("SELECT id FROM notes WHERE user_id=? AND question_id=?").get(user.id, questionId);
    if (ex) {
      db.prepare("UPDATE notes SET body=?, updated_at=datetime('now') WHERE id=?").run(body || "", ex.id);
      return Response.json({ ok: true, id: ex.id });
    }
  }
  const info = db.prepare("INSERT INTO notes(user_id,exam_id,question_id,body) VALUES(?,?,?,?)")
    .run(user.id, exam?.id ?? null, questionId || null, body || "");
  return Response.json({ ok: true, id: info.lastInsertRowid });
}

export async function PUT(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const { id, body } = await req.json();
  db.prepare("UPDATE notes SET body=?, updated_at=datetime('now') WHERE id=? AND user_id=?").run(body || "", id, user.id);
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const { id } = await req.json();
  db.prepare("DELETE FROM notes WHERE id=? AND user_id=?").run(id, user.id);
  return Response.json({ ok: true });
}
