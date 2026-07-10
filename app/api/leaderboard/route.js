import { getSessionUser, unauthorized } from "@/lib/auth";
import { leaderboardPayload } from "@/lib/leaderboard";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  return Response.json(leaderboardPayload(u));
}
