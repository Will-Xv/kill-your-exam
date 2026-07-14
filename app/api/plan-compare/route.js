import { requireUser, unauthorized } from "@/lib/auth";
import { compareWeeks, getPlanVariants } from "@/lib/planVersions";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  let weeks = { thisWeek: null, lastWeek: null };
  try { weeks = compareWeeks(user.id); } catch {}
  let variants = null;
  try { variants = getPlanVariants(user.id); } catch {}
  return Response.json({ ...weeks, variants });
}
