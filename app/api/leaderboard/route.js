import { getSessionUser, unauthorized } from "@/lib/auth";
import { leaderboard } from "@/lib/leaderboard";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const lb = leaderboard();
  const canTaunt = !!(lb.champion && lb.champion.id === u.id);
  return Response.json({ weekly: lb.weekly, total: lb.total, champion: lb.champion, me: { id: u.id, username: u.username }, canTaunt });
}
