
import { requireUser, unauthorized } from "@/lib/auth";
import { masteryMatrix } from "@/lib/mastery";
export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ matrix: [] });
  return Response.json({ matrix: masteryMatrix(exam.id) });
}
