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
    embedModel: getSetting("gemini_embed_model", "gemini-embedding-001"),
    googleLinked: !!me.google_sub,
    email: me.email || "",
    googleAvailable: !!process.env.GOOGLE_CLIENT_ID,
    judge0Url: getSetting("judge0_url", process.env.JUDGE0_URL || ""),
    judge0HasKey: !!getSetting("judge0_key", process.env.JUDGE0_KEY || "")
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
  if (body.judge0Url != null) setSetting("judge0_url", String(body.judge0Url).trim());
  if (body.judge0Key) setSetting("judge0_key", String(body.judge0Key).trim());
  return Response.json({ ok: true });
}
