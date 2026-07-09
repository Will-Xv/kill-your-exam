import db, { upsertDocument } from "@/lib/db";
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
      if (examType === "study") { upsertDocument(examId, "dossier", `# ${nm}\n\n${notes || "(用户只想学习这个主题,无需考试信息)"}`); db.prepare("UPDATE exams SET assess_status='done' WHERE id=?").run(examId); }
      return Response.json({ examId });
    }
  }
  // 建为「设置中」草稿(setup/draft):此时【不】归档旧考试、也不占用 active——设置完成(finalize)后才转正。
  const info = db.prepare(`INSERT INTO exams(name,exam_date,daily_minutes,exam_type,school,notes,status,assess_status,setup_state,user_id)
    VALUES(?,?,?,?,?,?,'setup',?,'draft',?)`).run(nm, examDate || null, dailyMinutes || 60, examType || null, school || null, notes || null, examType === "study" ? "done" : "pending", user.id);
  if (examType === "study") upsertDocument(info.lastInsertRowid, "dossier", `# ${nm}\n\n${notes || "(用户只想学习这个主题,无需考试信息)"}`);
  return Response.json({ examId: info.lastInsertRowid });
}
