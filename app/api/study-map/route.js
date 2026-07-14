import { requireUser, unauthorized } from "@/lib/auth";
import { buildStudyMap } from "@/lib/studyMap";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 120;

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ map: null, reason: "no_exam" });
  try { return Response.json(await buildStudyMap(user, exam)); }
  catch (e) { return aiErrorResponse(e); }
}
