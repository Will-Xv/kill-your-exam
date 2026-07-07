import { requireUser, unauthorized } from "@/lib/auth";
import { getBlueprint, generateBlueprint, ensureBlueprint, saveBlueprint } from "@/lib/blueprint";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

// GET: 读取当前蓝图(没有则生成)。POST: 按 instructions 重新生成蓝图(用户/杀手定制)。
export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ blueprint: null });
  // peek=1:只读现有蓝图,不触发生成(给模拟考首页快速展示题量/来源用)
  const peek = new URL(req.url).searchParams.get("peek");
  if (peek) return Response.json({ blueprint: getBlueprint(exam.id) });
  try { const bp = await ensureBlueprint(exam, user); return Response.json({ blueprint: bp }); }
  catch (e) { return aiErrorResponse(e); }
}

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ error: "no exam" }, { status: 400 });
  const { instructions = "", blueprint } = await req.json().catch(() => ({}));
  try {
    if (blueprint && typeof blueprint === "object") { blueprint.updatedAt = Date.now(); saveBlueprint(exam.id, blueprint); return Response.json({ blueprint }); }
    const bp = await generateBlueprint(exam, user, instructions);
    saveBlueprint(exam.id, bp);
    return Response.json({ blueprint: bp });
  } catch (e) { return aiErrorResponse(e); }
}
