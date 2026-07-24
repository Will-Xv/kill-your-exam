import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { estr } from "@/lib/i18nServer";
import { getActiveExam } from "@/lib/db";
import { setNavDock, setKillerHome } from "@/lib/uiPlacement";

// 手动移动导航栏(停靠边)。所有登录用户可改自己考试的界面。复用 setNavDock,和杀手同一条路径(记历史、可撤销)。
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { edge, killerHome, breakpoint } = await req.json().catch(() => ({}));
  const ex = getActiveExam(u.id);
  if (!ex) return Response.json({ error: estr(u?.lang, "没有激活的考试") }, { status: 400 });
  if (killerHome !== undefined) { const kh = setKillerHome(ex.id, u.id, killerHome, breakpoint); return kh ? Response.json({ ok: true, killerHome: kh }) : Response.json({ error: estr(u?.lang, "killerHome 只能是 dock/float") }, { status: 400 }); }
  const nd = setNavDock(ex.id, u.id, edge, breakpoint);
  return nd ? Response.json({ ok: true, navDock: nd }) : Response.json({ error: estr(u?.lang, "edge 只能是 top/bottom/left/right") }, { status: 400 });
}
