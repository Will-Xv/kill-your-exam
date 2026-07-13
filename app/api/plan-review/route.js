import { requireUser, unauthorized } from "@/lib/auth";
import { reviewPlan } from "@/lib/planReview";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 120;

export async function GET(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const totalMinutes = Number(url.searchParams.get("minutes")) || undefined;
  const mode = url.searchParams.get("mode") || undefined;
  try { return Response.json(await reviewPlan(user, { totalMinutes, mode })); }
  catch (e) { return aiErrorResponse(e); }
}
