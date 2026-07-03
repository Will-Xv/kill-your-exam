import { getSessionUser } from "@/lib/auth";
export async function GET() {
  const u = await getSessionUser();
  if (!u) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user: { id: u.id, username: u.username, isAdmin: !!u.is_admin } });
}
