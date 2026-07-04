import { generateText, embed, getModelName } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export async function POST() {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_developer) return forbidden();
  try {
    const t = await generateText("请只回复两个字:正常");
    await embed(["连接测试"]);
    return Response.json({ ok: true, model: getModelName(), reply: t.slice(0, 20) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
