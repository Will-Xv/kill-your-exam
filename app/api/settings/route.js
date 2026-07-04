import { getSetting, setSetting } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  const key = getSetting("gemini_api_key", process.env.GEMINI_API_KEY || "");
  return Response.json({
    username: me.username,
    isAdmin: !!me.is_admin,
    isDeveloper: !!me.is_developer,
    hasKey: !!key,
    keyTail: me.is_admin && key ? key.slice(-4) : "",
    model: getSetting("gemini_model", "gemini-2.5-flash"),
    embedModel: getSetting("gemini_embed_model", "gemini-embedding-001")
  });
}
export async function POST(req) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin) return forbidden();
  const body = await req.json();
  if (body.apiKey) setSetting("gemini_api_key", body.apiKey.trim());
  if (body.model) setSetting("gemini_model", body.model.trim());
  if (body.embedModel) setSetting("gemini_embed_model", body.embedModel.trim());
  return Response.json({ ok: true });
}
