import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { runAgent } from "@/lib/chatAgent";

export const maxDuration = 300;

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ messages: [] });
  const messages = db.prepare("SELECT * FROM chat_messages WHERE exam_id=? ORDER BY id DESC LIMIT 60").all(exam.id).reverse();
  return Response.json({ messages });
}

export async function POST(req) {
  try {
    const { message } = await req.json();
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "请先创建考试" }, { status: 400 });
    db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(exam.id, "user", message);
    const history = db.prepare("SELECT role, content FROM chat_messages WHERE exam_id=? AND role IN ('user','model') ORDER BY id DESC LIMIT 24").all(exam.id).reverse();
    const contents = history.map((m) => ({ role: m.role, parts: [{ text: m.content }] }));
    const out = await runAgent(contents, exam, user, []);
    return Response.json(out);
  } catch (e) { return aiErrorResponse(e); }
}
