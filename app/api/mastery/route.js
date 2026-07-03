import { getActiveExam } from "@/lib/db";
import { masteryMatrix } from "@/lib/mastery";
export async function GET() {
  const exam = getActiveExam();
  if (!exam) return Response.json({ matrix: [] });
  return Response.json({ matrix: masteryMatrix(exam.id) });
}
