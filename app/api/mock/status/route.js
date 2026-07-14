import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";

// 轮询模拟考判题状态:grading / done(带成绩+回顾)/ failed。
export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const mockId = Number(new URL(req.url).searchParams.get("mockId"));
  const mock = db.prepare("SELECT * FROM mock_exams WHERE id=?").get(mockId);
  if (!mock || mock.exam_id !== exam?.id) return forbidden();
  if (mock.status === "done" && mock.score_json) {
    return Response.json({ status: "done", score: JSON.parse(mock.score_json), results: mock.results_json ? JSON.parse(mock.results_json) : [] });
  }
  // 卡死自愈:判题中但起点已超过 8 分钟(进程重启/AI 卡住),报 failed 让前端显示「重试」。
  if (mock.status === "grading") {
    const startedAt = mock.grade_started_at ? Date.parse(mock.grade_started_at + "Z") : 0;
    if (startedAt && Date.now() - startedAt > 8 * 60 * 1000) return Response.json({ status: "failed", stale: true });
  }
  return Response.json({ status: mock.status || "grading" });
}
