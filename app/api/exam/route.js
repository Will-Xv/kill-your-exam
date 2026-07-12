import { requireUser, unauthorized } from "@/lib/auth";
import { examHomePayload } from "@/lib/homeData";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  return Response.json(examHomePayload(exam));
}
