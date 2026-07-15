import { requireUser, unauthorized } from "@/lib/auth";
import { runOnce } from "@/lib/judge0";

export const maxDuration = 60;

// 竞技场编程题:现场运行用户的代码(Judge0),返回输出/报错,供自测。
export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  let body = {}; try { body = await req.json(); } catch {}
  const source = String(body.source || "");
  if (!source.trim()) return Response.json({ ok: false, error: "empty" }, { status: 400 });
  const language = String(body.language || "python");
  const stdin = String(body.stdin || "");
  try {
    const r = await runOnce({ source, language, stdin });
    return Response.json(r);
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
