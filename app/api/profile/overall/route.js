import { getSessionUser, unauthorized } from "@/lib/auth";
import { getOverallDoc, overallUpdatedAt, gatherExams, regenerateOverall, setOverallDoc } from "@/lib/overall";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 120;

// 读取整体画像文件 + 各考试参考数据
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { perExam, overlap } = gatherExams(u.id);
  return Response.json({
    doc: getOverallDoc(u),
    updatedAt: overallUpdatedAt(u),
    exams: perExam.map(({ kps, ...rest }) => rest),
    overlap: overlap.map((o) => ({ title: o.title, exams: o.appears.map((a) => a.exam) })),
  });
}

// 用户直接编辑保存
export async function PUT(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { doc } = await req.json();
  const at = setOverallDoc(u.id, String(doc || ""));
  return Response.json({ ok: true, updatedAt: at });
}

// 让 AI 生成/更新(可带指令与附件)
export async function POST(req) {
  try {
    const u = await getSessionUser();
    if (!u) return unauthorized();
    let instruction = "", attachments = null;
    try { const b = await req.json(); instruction = b.instruction || ""; attachments = b.attachments || null; } catch {}
    const md = await regenerateOverall(u, { instruction, attachments });
    if (!md) return Response.json({ error: "no_data" }, { status: 400 });
    return Response.json({ doc: md, updatedAt: new Date().toISOString() });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
