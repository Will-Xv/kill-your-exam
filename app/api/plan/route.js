import { requireUser, unauthorized } from "@/lib/auth";
import { crossExamPlan } from "@/lib/planner";

export async function GET(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const totalMinutes = Number(url.searchParams.get("minutes")) || undefined;
  const mode = url.searchParams.get("mode") || undefined;
  return Response.json(crossExamPlan(user.id, { totalMinutes, mode }));
}
