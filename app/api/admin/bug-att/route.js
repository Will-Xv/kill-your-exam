import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { readBugAtt } from "@/lib/files";

export async function GET(req) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!(me.is_admin || me.is_developer)) return forbidden();
  const sp = new URL(req.url).searchParams;
  const bug = Number(sp.get("bug")); const i = Number(sp.get("i") || 0);
  const arr = readBugAtt(bug);
  if (!arr || !arr[i] || !arr[i].data) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(Buffer.from(arr[i].data, "base64"), { headers: { "Content-Type": arr[i].mime || "application/octet-stream" } });
}
