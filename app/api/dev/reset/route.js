import { resetUserData } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

// 开发者一键把【自己账号】重置为初始状态(清空自己的全部备考数据,保留账号/登录/设置)。
export async function POST() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  const r = resetUserData(u.id);
  return Response.json({ ok: true, ...r });
}
