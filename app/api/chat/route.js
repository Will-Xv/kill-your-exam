import db, { rootExamId, familyScope, scopeSql } from "@/lib/db";
import { extractMemoryBg } from "@/lib/memory";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { startRun } from "@/lib/chatAgent";
import { attachParts, generate } from "@/lib/gemini";
import { saveChatFile } from "@/lib/files";
import { setReqUser } from "@/lib/reqctx";

export const maxDuration = 300;

export async function GET() {
  const { user, exam } = await requireUser();
    if (user) setReqUser(user.id);
  if (!user) return unauthorized();
  const _chat = -user.id; // 【统一聊天】一个用户所有考试共用同一条聊天记录
  const messages = db.prepare("SELECT * FROM chat_messages WHERE exam_id=? ORDER BY id DESC LIMIT 60").all(_chat).reverse();
  return Response.json({ messages });
}

export async function POST(req) {
  try {
    const { message, attachments } = await req.json();
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const _cid = -user.id;                                   // 【统一聊天】聊天记录/摘要按用户合并
    const _memKey = exam ? rootExamId(exam.id) : -user.id;   // 记忆仍【按考试】分开
    db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(_cid, "user", message + (attachments?.length ? " 📎" : ""));

    // 自动压缩上下文:保留最近 RECENT 轮原文,更早的对话滚动压缩成摘要(节省 token、不丢关键信息)
    const RECENT = 16;
    const rows = db.prepare("SELECT id, role, content FROM chat_messages WHERE exam_id=? AND role IN ('user','model') ORDER BY id").all(_cid);
    let sum = db.prepare("SELECT summary, last_id FROM chat_summary WHERE exam_id=?").get(_cid) || { summary: "", last_id: 0 };
    const recent = rows.slice(-RECENT);
    // 后台抽取持久记忆事实(自我评估/偏好/目标/约束),不阻塞聊天
    try { extractMemoryBg(user, _memKey, recent.slice(-6).map((m) => (m.role === "user" ? "用户: " : "AI: ") + m.content).join("\n")); } catch {}
    const recentMinId = recent.length ? recent[0].id : Infinity;
    const toSummarize = rows.filter((m) => m.id > (sum.last_id || 0) && m.id < recentMinId);
    // 摘要压缩改到【后台】做,不阻塞发送(用现有摘要 + 最近消息作上下文足够;新摘要留给下一次用)。
    if (toSummarize.length) {
      const _prevSummary = sum.summary || "";
      const _text = toSummarize.map((m) => (m.role === "user" ? "用户: " : "AI: ") + m.content).join("\n");
      const _lastId = toSummarize[toSummarize.length - 1].id;
      Promise.resolve().then(async () => {
        try {
          const res = await generate(`把下面这段备考助手对话压缩成简洁的要点摘要,保留:用户的目标/偏好/已确认的决定/待办/关键结论,用于让 AI 延续对话时有记忆。已有摘要在前,请把新内容并入、去重,整体控制在 400 字内,直接输出摘要正文。\n\n【已有摘要】\n${_prevSummary || "(无)"}\n\n【新增对话】\n${_text}`);
          const ns = (res.text || "").trim();
          if (ns) db.prepare("INSERT INTO chat_summary(exam_id,summary,last_id) VALUES(?,?,?) ON CONFLICT(exam_id) DO UPDATE SET summary=excluded.summary, last_id=excluded.last_id").run(_cid, ns, _lastId);
        } catch {}
      });
    }

    const contents = [];
    if (sum.summary) {
      contents.push({ role: "user", parts: [{ text: "【之前对话的摘要,供你参考,不必回应】\n" + sum.summary }] });
      contents.push({ role: "model", parts: [{ text: "好的,我记住了。" }] });
    }
    for (const m of recent) contents.push({ role: m.role, parts: [{ text: m.content }] });
    // 把用户这条消息带的附件持久化(source=upload),让杀手在这一轮里可以用 save_attachment_as_material 把它们存进资料库(不再看一眼就丢)。
    let uploadedNote = "";
    if (exam && Array.isArray(attachments) && attachments.length) {
      const names = [];
      for (const a of attachments.slice(0, 4)) {
        if (!a || !a.data) continue;
        try {
          const buf = Buffer.from(a.data, "base64");
          const ins = db.prepare("INSERT INTO chat_files(exam_id,user_id,filename,mime,source) VALUES(?,?,?,?,'upload')").run(exam.id, user.id, a.name || "file", a.mime || "application/octet-stream");
          saveChatFile(ins.lastInsertRowid, buf); names.push(a.name || "file");
        } catch {}
      }
      if (names.length) uploadedNote = `\n(系统提示:主人这条消息附带了 ${names.length} 个文件:${names.join("、")}。你能直接读它们来回答;如果这些是本考试的学习资料、且主人想留存,可以用 save_attachment_as_material 把它们存进资料库——存之前先问一句主人要不要存,除非主人已明确说要存。)`;
    }
    const ap = await attachParts(attachments);
    if (ap.length && contents.length) contents[contents.length - 1].parts = [{ text: message + uploadedNote }, ...ap];
    else if (uploadedNote && contents.length) contents[contents.length - 1].parts = [{ text: message + uploadedNote }];
    const runId = startRun(exam, user, contents);
    return Response.json({ runId });
  } catch (e) { return aiErrorResponse(e); }
}

// 清空当前家族的杀手对话(聊天记录/摘要/运行/生成的文件),用于全新开始/演示。仅开发者(演示/自测用),普通用户不可清空。
export async function DELETE() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!user.is_developer) return forbidden(); // 硬门控:只有开发者账号能清空对话,普通用户(含让杀手绕道)一律拒绝
  const _chat = -user.id; // 统一聊天容器
  try { db.prepare("DELETE FROM chat_messages WHERE exam_id=?").run(_chat); } catch {}
  try { db.prepare("DELETE FROM chat_summary WHERE exam_id=?").run(_chat); } catch {}
  try { db.prepare("DELETE FROM chat_runs WHERE exam_id=?").run(_chat); } catch {}
  return Response.json({ ok: true });
}
