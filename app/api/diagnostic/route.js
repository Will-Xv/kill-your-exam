import { requireUser, unauthorized } from "@/lib/auth";
import { whereToStart } from "@/lib/startHere";

export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ mode: "no_exam" });
  const minutes = Number(new URL(req.url).searchParams.get("minutes")) || undefined;
  try { return Response.json(whereToStart(exam, { minutes })); } catch { return Response.json({ mode: "error" }); }
}
