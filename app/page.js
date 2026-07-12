import HomeClient from "@/components/HomeClient";
import { getSessionUser } from "@/lib/auth";
import { leaderboardPayload } from "@/lib/leaderboard";
import { examHomePayload } from "@/lib/homeData";
import { getActiveExam } from "@/lib/db";

export const dynamic = "force-dynamic"; // 每次按登录用户即时渲染

// 服务端预取排行榜数据,随页面 HTML 一起下发 —— 首页一打开排行榜就在,手机端不再"慢半拍"。
export default async function Page() {
  let initialLeaderboard = null; let initialIsDev = false; let initialData = null;
  try {
    const u = await getSessionUser();
    if (u) {
      initialLeaderboard = leaderboardPayload(u);
      initialIsDev = !!u.is_developer;
      const exam = getActiveExam(u.id);
      initialData = examHomePayload(exam); // 首帧就带上考试面板数据,刷新不再闪空白
    }
  } catch {}
  return <HomeClient initialLeaderboard={initialLeaderboard} initialIsDev={initialIsDev} initialData={initialData} />;
}
