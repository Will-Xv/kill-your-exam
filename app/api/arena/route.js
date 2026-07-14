import { requireUser, unauthorized } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { arenaTurn } from "@/lib/arena";

export const maxDuration = 120;

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });
    const { mode, scope, history } = await req.json();
    const r = await arenaTurn(user, exam, { mode, scope, history: Array.isArray(history) ? history.slice(-24) : [] });
    return Response.json(r);
  } catch (e) { return aiErrorResponse(e); }
}
