import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
export async function GET(){
  const {user,exam}=await requireUser();
  if(!user) return unauthorized();
  if(!exam) return Response.json({jobs:[]});
  const jobs=db.prepare("SELECT id, goal, status, collected, log, updated_at FROM browser_jobs WHERE exam_id=? ORDER BY id DESC LIMIT 5").all(exam.id);
  return Response.json({jobs});
}
