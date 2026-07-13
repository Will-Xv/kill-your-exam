import { requireUser, unauthorized } from "@/lib/auth";
import { resolveReferenceList, clearResolveBanner } from "@/lib/referenceResolve";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

// 手动建考试也能用:把某份「指针型」复习清单解析成真题入库。
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ error: "no exam" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  if (b.action === "dismiss") { clearResolveBanner(user.id); return Response.json({ ok: true }); }
  try {
    const r = await resolveReferenceList(user, exam, { text: b.text, materialId: b.materialId, markMust: !!b.markMust });
    return Response.json({ ok: true, ...r });
  } catch (e) { return aiErrorResponse(e); }
}
