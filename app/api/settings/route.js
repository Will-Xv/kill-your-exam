import { getSetting, setSetting } from "@/lib/db";

export async function GET() {
  const key = getSetting("gemini_api_key", process.env.GEMINI_API_KEY || "");
  return Response.json({
    hasKey: !!key,
    keyTail: key ? key.slice(-4) : "",
    model: getSetting("gemini_model", "gemini-2.5-flash"),
    embedModel: getSetting("gemini_embed_model", "gemini-embedding-001")
  });
}
export async function POST(req) {
  const body = await req.json();
  if (body.apiKey) setSetting("gemini_api_key", body.apiKey.trim());
  if (body.model) setSetting("gemini_model", body.model.trim());
  if (body.embedModel) setSetting("gemini_embed_model", body.embedModel.trim());
  return Response.json({ ok: true });
}
