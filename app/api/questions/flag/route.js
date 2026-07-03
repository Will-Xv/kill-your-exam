import db from "@/lib/db";
export async function POST(req) {
  const { questionId } = await req.json();
  db.prepare("UPDATE questions SET flagged=1 WHERE id=?").run(questionId);
  return Response.json({ ok: true });
}
