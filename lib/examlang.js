import db, { getDocument } from "./db";
import { generateJson } from "./gemini";

// 判定并缓存"这门考试真正考试时用的语言",供出题使用(与界面语言无关)。
export async function resolveExamLang(exam) {
  if (!exam) return null;
  if (exam.exam_lang) return exam.exam_lang;
  let sample = "";
  try { sample += (getDocument(exam.id, "dossier")?.content_md || "").slice(0, 900); } catch {}
  try { const c = db.prepare("SELECT content FROM chunks WHERE exam_id=? LIMIT 3").all(exam.id).map((x) => x.content).join("\n"); sample += "\n" + c.slice(0, 900); } catch {}
  let lang = null;
  try {
    const out = await generateJson(
      `这门考试【真正考试时,试卷和作答】用什么语言?只看考试本身,不要看界面语言。\n考试名称:${exam.name}\n相关信息(可能含资料/档案):${sample.slice(0, 1400)}\n返回该语言的通用名称,例如:English、中文、français、日本語、español、Deutsch、한국어。只返回语言名。`,
      { type: "object", properties: { language: { type: "string" } }, required: ["language"] }
    );
    lang = (out.language || "").trim().slice(0, 40);
  } catch {}
  if (!lang) return null;
  try { db.prepare("UPDATE exams SET exam_lang=? WHERE id=?").run(lang, exam.id); } catch {}
  return lang;
}
