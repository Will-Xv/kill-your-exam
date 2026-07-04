import db from "@/lib/db";
function cors(){return{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type, X-Ingest-Token","Access-Control-Allow-Methods":"POST, OPTIONS"};}
export async function OPTIONS(){return new Response(null,{headers:cors()});}
export async function POST(req){
  const token=req.headers.get("X-Ingest-Token")||"";
  const row=db.prepare("SELECT user_id FROM ingest_tokens WHERE token=?").get(token);
  if(!row) return Response.json({error:"invalid token"},{status:401,headers:cors()});
  const job=db.prepare("SELECT id, goal FROM browser_jobs WHERE user_id=? AND status='pending' ORDER BY id LIMIT 1").get(row.user_id);
  if(!job) return Response.json({job:null},{headers:cors()});
  db.prepare("UPDATE browser_jobs SET status='running', updated_at=datetime('now') WHERE id=?").run(job.id);
  return Response.json({job},{headers:cors()});
}
