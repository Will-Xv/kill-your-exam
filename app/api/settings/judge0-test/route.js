import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { runOnce, judge0Config } from "@/lib/judge0";

export const maxDuration = 60;

// 用一段极小的代码真跑一遍,验证 Judge0 地址+密钥+鉴权+轮询是否通。
export async function POST() {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin) return forbidden();
  const cfg = judge0Config();
  if (!cfg.configured) return Response.json({ ok: false, reason: "no_url" });
  try {
    const r = await runOnce({ source: "print(6*7)", language: "python", expected: "42" });
    if (r.notConfigured) return Response.json({ ok: false, reason: "no_url" });
    if (!r.ok) return Response.json({ ok: false, reason: r.error || "run_failed", detail: r.detail || "" });
    return Response.json({ ok: !!r.passed, status: r.status, stdout: (r.stdout || "").trim(), passed: !!r.passed });
  } catch (e) {
    return Response.json({ ok: false, reason: "exception", detail: String(e && e.message || e).slice(0, 200) });
  }
}
