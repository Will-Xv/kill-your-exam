import { cookies } from "next/headers";

export async function POST(req) {
  const { code } = await req.json();
  const expected = process.env.ACCESS_CODE || "666666";
  if (String(code).trim() !== expected) {
    return Response.json({ ok: false, error: "口令不对" }, { status: 401 });
  }
  const c = await cookies();
  c.set("beikao_access", "1", { httpOnly: true, maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  return Response.json({ ok: true });
}
