import { requireUser, unauthorized } from "@/lib/auth";
import { getStoredDiagnosis, getBanner, clearBanner, getDiagnosisConfig } from "@/lib/diagnose";

// 只读:返回已存的根因诊断(由"累计使用时长满阈值"自动生成,或用户让杀手生成)+ 首页横幅 + 配置。
export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  return Response.json({
    diagnosis: exam ? getStoredDiagnosis(exam.id) : null,
    banner: getBanner(user.id),
    config: getDiagnosisConfig(user.id),
  });
}
// 关掉首页横幅提醒。
export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (b.action === "dismiss") { clearBanner(user.id); return Response.json({ ok: true }); }
  return Response.json({ ok: false });
}
