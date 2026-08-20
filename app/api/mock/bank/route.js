import { requireUser, unauthorized } from "@/lib/auth";
import db, { ownScope, scopeSql } from "@/lib/db";
import { bankList, bankAdd, bankSetMust, bankDelete, setClosedBank, bankParseText } from "@/lib/questionBank";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ questions: [], closedBank: false });
  // realCount:【做真题】那条路的真实可用量 —— 只有你自己提供的题才算 is_real=1
  // (粘贴进题库 / 上传做题识别出来的 / 从资料里定位到的原题);AI 生成和联网仿真都不算。
  let realCount = 0;
  try { realCount = db.prepare(`SELECT COUNT(*) n FROM questions WHERE exam_id IN ${scopeSql(ownScope(exam.id))} AND flagged=0 AND is_real=1`).get().n; } catch {}
  return Response.json({ questions: bankList(exam.id), closedBank: !!exam.closed_bank, realCount });
}

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ error: "no exam" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "add") { bankAdd(exam.id, b.question || {}); }
    else if (b.action === "parse") { const r = await bankParseText(exam, b.text || "", user.lang, !!b.markMust); return Response.json({ ok: true, added: r.added, questions: bankList(exam.id) }); }
    else if (b.action === "must") { bankSetMust(exam.id, b.id, b.on); }
    else if (b.action === "delete") { bankDelete(exam.id, b.id); }
    else if (b.action === "closed") { setClosedBank(exam.id, b.on); return Response.json({ ok: true, closedBank: !!b.on, questions: bankList(exam.id) }); }
    else return Response.json({ error: "bad action" }, { status: 400 });
    return Response.json({ ok: true, questions: bankList(exam.id) });
  } catch (e) { return aiErrorResponse(e); }
}
