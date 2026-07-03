import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";

// 导出本人全部数据(不含密码哈希),JSON 下载
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const exams = db.prepare("SELECT id,name,exam_date,daily_minutes,status,created_at FROM exams WHERE user_id=?").all(u.id);
  const data = { user: { username: u.username, lang: u.lang }, exportedAt: new Date().toISOString(), exams: [] };
  for (const e of exams) {
    data.exams.push({
      ...e,
      documents: db.prepare("SELECT type,content_md FROM documents WHERE exam_id=?").all(e.id),
      knowledge_points: db.prepare("SELECT id,parent_id,title,coverage FROM knowledge_points WHERE exam_id=?").all(e.id),
      materials: db.prepare("SELECT filename,source_url,kind,status FROM materials WHERE exam_id=?").all(e.id),
      attempts: db.prepare("SELECT question_id,kp_id,correct,score,mode,created_at FROM attempts WHERE exam_id=?").all(e.id),
      chats: db.prepare("SELECT role,content,created_at FROM chat_messages WHERE exam_id=?").all(e.id)
    });
  }
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="beikao-export-${u.username}.json"` }
  });
}
