import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

// 快速创建考试(不跑 AI),收集完整信息。可传 examId 复用草稿避免重复创建。
export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const { examId, name, examDate, dailyMinutes, examType, school, notes } = await req.json();
  const nm = String(name || "").trim();
  if (!nm) return Response.json({ error: "请填写考试名称" }, { status: 400 });

  // 学校信息存进用户档案(可随时改)
  if (examType === "school" && school) {
    let profile = {};
    try { profile = JSON.parse(user.profile_json || "{}"); } catch {}
    profile.school = school;
    db.prepare("UPDATE users SET profile_json=? WHERE id=?").run(JSON.stringify(profile), user.id);
  }

  if (examId) {
    const e = db.prepare("SELECT * FROM exams WHERE id=? AND user_id=?").get(examId, user.id);
    if (e) {
      db.prepare("UPDATE exams SET name=?, exam_date=?, daily_minutes=?, exam_type=?, school=?, notes=? WHERE id=?")
        .run(nm, examDate || null, dailyMinutes || 60, examType || null, school || null, notes || null, examId);
      return Response.json({ examId });
    }
  }
  // 归档旧的 active,建新的
  db.prepare("UPDATE exams SET status='archived' WHERE user_id=? AND status='active'").run(user.id);
  const info = db.prepare(`INSERT INTO exams(name,exam_date,daily_minutes,exam_type,school,notes,status,assess_status,user_id)
    VALUES(?,?,?,?,?,?,'active','pending',?)`).run(nm, examDate || null, dailyMinutes || 60, examType || null, school || null, notes || null, user.id);
  return Response.json({ examId: info.lastInsertRowid });
}
