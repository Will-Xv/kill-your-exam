import { requireUser, unauthorized } from "@/lib/auth";
import { crossExamPlan } from "@/lib/planner";

export async function GET(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  try {
    const url = new URL(req.url);
    const totalMinutes = Number(url.searchParams.get("minutes")) || undefined;
    const mode = url.searchParams.get("mode") || undefined;
    return Response.json(crossExamPlan(user.id, { totalMinutes, mode }));
  } catch (e) {
    return Response.json({ error: String(e && e.message || e), stack: String(e && e.stack || "").split("\n").slice(0, 4) }, { status: 200 });
  }
}
