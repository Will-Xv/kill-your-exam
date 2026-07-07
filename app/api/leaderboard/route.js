import { getSessionUser, unauthorized } from "@/lib/auth";
import { leaderboard, rankMaps, canTauntTarget } from "@/lib/leaderboard";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const lb = leaderboard();
  const maps = rankMaps();
  const deco = (arr) => arr.map((r) => ({ ...r, canTaunt: canTauntTarget(u.id, r.id, maps) }));
  const totalChampion = lb.total[0] ? { id: lb.total[0].id, username: lb.total[0].username, n: lb.total[0].n } : null;
  return Response.json({ weekly: deco(lb.weekly), total: deco(lb.total), champion: lb.champion, totalChampion, me: { id: u.id, username: u.username } });
}
