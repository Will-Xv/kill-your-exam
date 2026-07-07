import { getSessionUser, unauthorized } from "@/lib/auth";
import { leaderboard, isChampion } from "@/lib/leaderboard";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const lb = leaderboard();
  const canTaunt = isChampion(u.id);
  const totalChampion = lb.total[0] ? { id: lb.total[0].id, username: lb.total[0].username, n: lb.total[0].n } : null;
  return Response.json({ weekly: lb.weekly, total: lb.total, champion: lb.champion, totalChampion, me: { id: u.id, username: u.username }, canTaunt });
}
