import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { runAgent } from "@/lib/chatAgent";
import { attachParts, generate } from "@/lib/gemini";

export const maxDuration = 300;

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ messages: [] });
  const messages = db.prepare("SELECT * FROM chat_messages WHERE exam_id=? ORDER BY id DESC LIMIT 60").all(exam.id).reverse();
  return Response.json({ messages });
}

export async function POST(req) {
  try {
    const { message, attachments } = await req.json();
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "请先创建考试" }, { status: 400 });
    db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(exam.id, "user", message + (attachments?.length ? " 📎" : ""));

    // 自动压缩上下文:保留最近 RECENT 轮原文,更早的对话滚动压缩成摘要(节省 token、不丢关键信息)
    const RECENT = 16;
    const rows = db.prepare("SELECT id, role, content FROM chat_messages WHERE exam_id=? AND role IN ('user','model') ORDER BY id").all(exam.id);
    let sum = db.prepare("SELECT summary, last_id FROM chat_summary WHERE exam_id=?").get(exam.id) || { summary: "", last_id: 0 };
    const recent = rows.slice(-RECENT);
    const recentMinId = recent.length ? recent[0].id : Infinity;
    const toSummarize = rows.filter((m) => m.id > (sum.last_id || 0) && m.id < recentMinId);
    if (toSummarize.length) {
      const text = toSummarize.map((m) => (m.role === "user" ? "用户: " : "AI: ") + m.content).join("\n");
      try {
        const res = await generate(
          `把下面这段备考助手对话压缩成简洁的要点摘要,保留:用户的目标/偏好/已确认的决定/待办/关键结论,用于让 AI 延续对话时有记忆。已有摘要在前,请把新内容并入、去重,整体控制在 400 字内,直接输出摘要正文。\n\n【已有摘要】\n${sum.summary || "(无)"}\n\n【新增对话】\n${text}`
        );
        const ns = (res.text || "").trim();
        if (ns) {
          const lastId = toSummarize[toSummarize.length - 1].id;
          db.prepare("INSERT INTO chat_summary(exam_id,summary,last_id) VALUES(?,?,?) ON CONFLICT(exam_id) DO UPDATE SET summary=excluded.summary, last_id=excluded.last_id")
            .run(exam.id, ns, lastId);
          sum = { summary: ns, last_id: lastId };
        }
      } catch {}
    }

    const contents = [];
    if (sum.summary) {
      contents.push({ role: "user", parts: [{ text: "【之前对话的摘要,供你参考,不必回应】\n" + sum.summary }] });
      contents.push({ role: "model", parts: [{ text: "好的,我记住了。" }] });
    }
    for (const m of recent) contents.push({ role: m.role, parts: [{ text: m.content }] });
    const ap = attachParts(attachments);
    if (ap.length && contents.length) contents[contents.length - 1].parts = [{ text: message }, ...ap];
    const out = await runAgent(contents, exam, user, []);
    return Response.json(out);
  } catch (e) { return aiErrorResponse(e); }
}
