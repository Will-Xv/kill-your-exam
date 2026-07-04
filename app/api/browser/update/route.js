import db from "@/lib/db";
function cors(){return{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type, X-Ingest-Token","Access-Control-Allow-Methods":"POST, OPTIONS"};}
export async function OPTIONS(){return new Response(null,{headers:cors()});}
export async function POST(req){
  const token=req.headers.get("X-Ingest-Token")||"";
  const row=db.prepare("SELECT user_id FROM ingest_tokens WHERE token=?").get(token);
  if(!row) return Response.json({error:"invalid token"},{status:401,headers:cors()});
  const {jobId,status,collected,logLine}=await req.json();
  const j=db.prepare("SELECT * FROM browser_jobs WHERE id=? AND user_id=?").get(jobId,row.user_id);
  if(!j) return Response.json({error:"no job"},{status:404,headers:cors()});
  const newLog=logLine?((j.log?j.log+"\n":"")+logLine).slice(-2000):j.log;
  db.prepare("UPDATE browser_jobs SET status=COALESCE(?,status), collected=COALESCE(?,collected), log=?, updated_at=datetime('now') WHERE id=?")
    .run(status||null, collected!=null?collected:null, newLog, jobId);
  return Response.json({ok:true},{headers:cors()});
}
