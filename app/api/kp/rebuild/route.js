import { requireUser, unauthorized } from "@/lib/auth";
import { rebuildKnowledgeTree } from "@/lib/generators";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ error: "no exam" }, { status: 400 });
  const { mode } = await req.json().catch(() => ({}));
  if (!["keep", "summarize", "none"].includes(mode)) return Response.json({ error: "bad mode" }, { status: 400 });
  try {
    const r = await rebuildKnowledgeTree(exam, user.lang, mode);
    return Response.json({ ok: true, ...r });
  } catch (e) { return aiErrorResponse(e); }
}
