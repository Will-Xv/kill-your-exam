import db, { getDocument, upsertDocument } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";

// 把整体画像内容写进某个考试的《进度档案》
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { examId } = await req.json();
  const exam = db.prepare("SELECT * FROM exams WHERE id=? AND user_id=? AND deleted_at IS NULL").get(examId, u.id);
  if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });

  let overall = null;
  try { overall = JSON.parse(u.profile_json || "{}").overall; } catch {}
  if (!overall) return Response.json({ error: "no_profile" }, { status: 400 });

  const list = (arr) => (arr && arr.length ? arr.map((x) => "- " + x).join("\n") : "- (无)");
  const block = `## 🧭 跨考试整体画像(同步于 ${new Date().toISOString().slice(0, 16).replace("T", " ")})

${overall.summary || ""}

**强项**
${list(overall.strengths)}

**薄弱**
${list(overall.weaknesses)}

**学习习惯**
${list(overall.habits)}

**可迁移到本考试的能力**
${list(overall.transferable)}

**整体建议**
${list(overall.advice)}
`;

  const prev = getDocument(exam.id, "progress")?.content_md || "";
  // 去掉旧的同一段落(以标题识别),避免重复堆叠
  const cleaned = prev.replace(/## 🧭 跨考试整体画像[\s\S]*?(?=\n## |$)/g, "").trim();
  const next = (cleaned ? cleaned + "\n\n" : "") + block;
  upsertDocument(exam.id, "progress", next);
  return Response.json({ ok: true, examName: exam.name });
}
