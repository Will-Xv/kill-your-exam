import db, { getSetting, setSetting } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { listGroups, createGroup } from "@/lib/examGroups";

const topExams = (uid) => db.prepare("SELECT id, name FROM exams WHERE user_id=? AND parent_exam_id IS NULL AND deleted_at IS NULL AND (setup_state IS NULL OR setup_state NOT IN ('draft','generating'))").all(uid);
const ungroupedIds = (uid) => { const tops = topExams(uid); const g = new Set(); for (const gr of listGroups(uid)) for (const e of gr.examIds) g.add(Number(e)); return tops.filter((e) => !g.has(Number(e.id))); };

// 主页/追杀计划的"要不要建成一组"提示。
export async function GET() {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const tops = topExams(user.id);
  const ung = ungroupedIds(user.id);
  const dismissed = getSetting(`exam_group_prompt_dismissed:${user.id}`) === "1";
  return Response.json({ shouldPrompt: !dismissed && tops.length >= 2 && ung.length >= 2, examCount: tops.length, ungroupedCount: ung.length });
}

export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const { action, name } = await req.json().catch(() => ({}));
  if (action === "dismiss_forever") { try { setSetting(`exam_group_prompt_dismissed:${user.id}`, "1"); } catch {} return Response.json({ ok: true }); }
  if (action === "group_all") {
    const ids = ungroupedIds(user.id).map((e) => e.id);
    if (!ids.length) return Response.json({ ok: false, note: "no_ungrouped" });
    const gid = createGroup(user.id, name || "我的考试", ids);
    return Response.json({ ok: true, groupId: gid, added: ids.length });
  }
  return Response.json({ ok: false }, { status: 400 });
}
