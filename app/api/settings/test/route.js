import { generateText, embed, getModelName } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";

export async function POST() {
  try {
    const t = await generateText("请只回复两个字:正常");
    await embed(["连接测试"]);
    return Response.json({ ok: true, model: getModelName(), reply: t.slice(0, 20) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
