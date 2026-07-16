import { requireUser, unauthorized } from "@/lib/auth";
import { examHomePayload } from "@/lib/homeData";
import { setReqUser } from "@/lib/reqctx";

export async function GET() {
  const { user, exam } = await requireUser();
    if (user) setReqUser(user.id);
  if (!user) return unauthorized();
  return Response.json(examHomePayload(exam));
}
