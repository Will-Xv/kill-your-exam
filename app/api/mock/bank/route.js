import { requireUser, unauthorized } from "@/lib/auth";
import { bankList, bankAdd, bankSetMust, bankDelete, setClosedBank, bankParseText } from "@/lib/questionBank";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ questions: [], closedBank: false });
  return Response.json({ questions: bankList(exam.id), closedBank: !!exam.closed_bank });
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
