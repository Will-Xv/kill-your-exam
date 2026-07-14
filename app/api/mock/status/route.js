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
  return Response.json({ status: mock.status || "grading" });
}
