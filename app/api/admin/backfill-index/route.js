import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { missingSummary, backfillMissing, backfillState } from "@/lib/backfillIndex";

// 管理员:给【2026-08 之前上传、没有索引】的 PDF/图片补建检索索引。
// GET 只预览(不花钱),POST 才真跑(后台串行)。
export async function GET() {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin) return forbidden();
  return Response.json({ ...missingSummary(), ...backfillState() });
}
export async function POST() {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin) return forbidden();
  const r = await backfillMissing();
  return Response.json(r);
}
