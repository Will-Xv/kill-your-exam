import db, { getActiveExam, familyScope } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { getExamPlacement, setExamPlacement } from "@/lib/uiPlacement";
import { getCustomItems } from "@/lib/uiRegistry";

// 两层布局:
//  - global(全站默认):只有开发者能 publish/清除,发布给所有人。
//  - exam(当前考试布局):任何登录用户都能改自己每一门考试的布局(per-exam 覆盖,优先于全局默认)。
export async function GET() {
  let placement = null, examPlacement = null, customItems = [], canPublish = false;
  try { customItems = getCustomItems(); } catch {}
  try { const row = db.prepare("SELECT value FROM settings WHERE key='ui_item_placement'").get(); if (row && row.value) placement = JSON.parse(row.value); } catch {}
  try {
    const u = await getSessionUser();
    if (u) {
      canPublish = !!u.is_developer;
      const ex = getActiveExam(u.id);
      if (ex) {
        examPlacement = getExamPlacement(ex.id);
        // 隔离跨考试污染:自定义考核(feature_id=xform<模式id>)只保留【属于当前考试家族】的——
        // 否则别的考试建的庖丁/惠子/无用之树/Coding-First 会冒进每门考试的栏目分配。非 xform 的通用自定义功能不按考试隔离。
        try {
          const fam = new Set(familyScope(ex.id).map(Number));
          customItems = customItems.filter((it) => {
            const m = /^xform(\d+)$/.exec(String(it.id || ""));
            if (!m) return true;
            const row = db.prepare("SELECT exam_id FROM custom_modes WHERE id=?").get(Number(m[1]));
            return row ? fam.has(Number(row.exam_id)) : false;
          });
        } catch {}
      }
    }
  } catch {}
  return Response.json({ placement, examPlacement, customItems, canPublish });
}

export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const scope = body && body.scope;
  const placement = body && body.placement;

  if (scope === "exam") {                       // 当前考试布局:所有登录用户都能改
    const ex = getActiveExam(u.id);
    if (!ex) return Response.json({ error: "no_exam" }, { status: 400 });
    setExamPlacement(ex.id, u.id, placement == null ? null : placement, placement == null ? "重置本考试布局" : "编辑本考试布局");
    return Response.json({ ok: true, scope: "exam", cleared: placement == null });
  }

  // global(默认发布):仅开发者
  if (!u.is_developer) return forbidden();
  if (placement == null) { db.prepare("DELETE FROM settings WHERE key='ui_item_placement'").run(); return Response.json({ ok: true, scope: "global", cleared: true }); }
  db.prepare("INSERT INTO settings(key,value) VALUES('ui_item_placement',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(placement));
  return Response.json({ ok: true, scope: "global" });
}
