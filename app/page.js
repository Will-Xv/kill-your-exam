import HomeClient from "@/components/HomeClient";
import { getSessionUser } from "@/lib/auth";
import { leaderboardPayload } from "@/lib/leaderboard";

export const dynamic = "force-dynamic"; // 每次按登录用户即时渲染

// 服务端预取排行榜数据,随页面 HTML 一起下发 —— 首页一打开排行榜就在,手机端不再"慢半拍"。
export default async function Page() {
  let initialLeaderboard = null;
  try { const u = await getSessionUser(); if (u) initialLeaderboard = leaderboardPayload(u); } catch {}
  return <HomeClient initialLeaderboard={initialLeaderboard} />;
}
