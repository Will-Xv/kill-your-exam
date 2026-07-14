import { requireUser, unauthorized } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { runTests, runOnce } from "@/lib/judge0";

export const maxDuration = 120;

// 只运行代码给用户看结果(不判分入库)。tests 有就跑用例,没有就单跑 stdin。
export async function POST(req) {
  try {
    const { user } = await requireUser();
    if (!user) return unauthorized();
    const { source, language, tests, stdin } = await req.json();
    if (!source) return Response.json({ error: "empty_source" }, { status: 400 });
    if (Array.isArray(tests) && tests.length) {
      const r = await runTests({ source, language, tests });
      if (r.notConfigured) return Response.json({ notConfigured: true });
      return Response.json(r);
    }
    const r = await runOnce({ source, language, stdin: stdin || "" });
    if (r.notConfigured) return Response.json({ notConfigured: true });
    return Response.json(r);
  } catch (e) { return aiErrorResponse(e); }
}
