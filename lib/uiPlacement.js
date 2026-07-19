// 服务端:按考试(per-exam)的功能放置表 + 改动历史(可撤销/可迁移)。杀手的 UI 写砖头用它。
// 仅开发者账号会写(灰度);普通用户没有 per-exam 覆盖,渲染回退到全局默认,行为不变。
import db, { getSetting, setSetting } from "@/lib/db";
import { defaultPlacement, applyMove } from "@/lib/uilab/placementCore";

const key = (examId) => "ui_placement:" + examId;
function ensureEvents() { try { db.exec(`CREATE TABLE IF NOT EXISTS ui_events (id INTEGER PRIMARY KEY, exam_id INTEGER, user_id INTEGER, summary TEXT, before_json TEXT, after_json TEXT, undone INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`); } catch {} try { db.exec("ALTER TABLE ui_events ADD COLUMN skey TEXT"); } catch {} }
// 通用:记一次可撤销的设置改动(before/after + 该设置的 key),供放置表和首页布局共用。
export function recordSet(examId, userId, skey, value, summary) {
  ensureEvents();
  const before = getSetting(skey, "") || "";
  if (value == null) { try { db.prepare("DELETE FROM settings WHERE key=?").run(skey); } catch {} }
  else setSetting(skey, JSON.stringify(value));
  try { db.prepare("INSERT INTO ui_events(exam_id,user_id,skey,summary,before_json,after_json) VALUES(?,?,?,?,?,?)").run(examId, userId, skey, summary || "", before, value == null ? "" : JSON.stringify(value)); } catch {}
}

export function getExamPlacement(examId) { try { const v = getSetting(key(examId), ""); return v ? JSON.parse(v) : null; } catch { return null; } }
// 基准放置表:本考试覆盖 > 全局已发布 > 内置默认。杀手改 UI 从这个基准出发。
export function basePlacement(examId) {
  const ex = getExamPlacement(examId); if (ex) return ex;
  try { const g = getSetting("ui_item_placement", ""); if (g) return JSON.parse(g); } catch {}
  return defaultPlacement();
}
export function setExamPlacement(examId, userId, placement, summary) {
  recordSet(examId, userId, key(examId), placement, summary);
}
// 杀手移动一个功能(默认电脑+手机一致;传 breakpoint 则只改该端)。记历史、可撤销。
// 杀手/编辑器改导航栏停靠边(top/bottom),默认电脑+手机一致;传 breakpoint 则只改该端。记历史、可撤销。
export function setKillerHome(examId, userId, mode, breakpoint) { // 杀手去处:dock/nav/more/morefeatures;绝不 hidden
  const m = ["dock", "float"].includes(mode) ? mode : null;
  if (!m) return null;
  const pl = basePlacement(examId);
  pl.killerHome = pl.killerHome && typeof pl.killerHome === "object" ? { ...pl.killerHome } : { desktop: "dock", mobile: "dock" };
  const bps = breakpoint === "desktop" || breakpoint === "mobile" ? [breakpoint] : ["desktop", "mobile"];
  for (const b of bps) pl.killerHome[b] = m;
  setExamPlacement(examId, userId, pl, `killer home -> ${m}${breakpoint ? "(" + breakpoint + ")" : ""}`);
  return pl.killerHome;
}
export function setNavDock(examId, userId, edge, breakpoint) {
  const e = ["top", "bottom", "left", "right"].includes(edge) ? edge : null;
  if (!e) return null;
  const pl = basePlacement(examId);
  pl.navDock = pl.navDock && typeof pl.navDock === "object" ? { ...pl.navDock } : { desktop: "top", mobile: "bottom" };
  const bps = breakpoint === "desktop" || breakpoint === "mobile" ? [breakpoint] : ["desktop", "mobile"];
  for (const b of bps) pl.navDock[b] = e;
  setExamPlacement(examId, userId, pl, `nav dock → ${e}${breakpoint ? "(" + breakpoint + ")" : "(desktop+mobile)"}`);
  return pl.navDock;
}
export function moveFeature(examId, userId, { featureId, where, breakpoint, index }) {
  let pl = basePlacement(examId);
  const bps = breakpoint === "desktop" || breakpoint === "mobile" ? [breakpoint] : ["desktop", "mobile"];
  for (const b of bps) pl = applyMove(pl, b, featureId, where, typeof index === "number" ? index : undefined);
  setExamPlacement(examId, userId, pl, `move ${featureId} → ${where}${breakpoint ? "(" + breakpoint + ")" : "(desktop+mobile)"}`);
  return pl;
}
export function undoExamUi(examId) {
  ensureEvents();
  const ev = db.prepare("SELECT * FROM ui_events WHERE exam_id=? AND undone=0 ORDER BY id DESC LIMIT 1").get(examId);
  if (!ev) return null;
  const sk = ev.skey || key(examId); // 老记录没有 skey 时按放置表 key 还原
  if (ev.before_json) setSetting(sk, ev.before_json); else { try { db.prepare("DELETE FROM settings WHERE key=?").run(sk); } catch {} }
  db.prepare("UPDATE ui_events SET undone=1 WHERE id=?").run(ev.id);
  return ev.summary || "last UI change";
}
export function listUiEvents(examId) { ensureEvents(); return db.prepare("SELECT id,summary,undone,created_at FROM ui_events WHERE exam_id=? ORDER BY id DESC LIMIT 30").all(examId); }
// 迁移:把一门考试的 UI 放置表复制到另一门(用户要求"迁移到别的考试")。
export function migrateExamUi(fromExamId, toUserId, toExamId) {
  const pl = getExamPlacement(fromExamId); if (!pl) return false;
  setExamPlacement(toExamId, toUserId, pl, `migrated UI from exam #${fromExamId}`);
  return true;
}

// —— 建考试时【按内容智能删/凸显栏目】——AI 判断哪些【可选】内置栏目跟这门目标相关:
// 无关的(如纯自学理论摆着模拟考/屠杀准备、非表演类摆着表演回放)收进 hidden;相关的保留在可见处。
// 只动这 4 个可选栏目、其余一律默认,失败则什么都不改(不阻塞建考试)。
import { generateJson, langInstruction } from "@/lib/gemini";
import { getDocument } from "@/lib/db";
export async function autoAdjustExamUi(exam, user, dossierText) {
  try {
    const dossier = String(dossierText || getDocument(exam.id, "dossier")?.content_md || "").slice(0, 1500);
    const out = await generateJson(
      `判断这门备考目标该显示哪些【可选栏目】。要【按功能是否真的用得上】来定,别泛泛而判。考试名:「${exam.name}」${exam.exam_type ? "(类型:" + exam.exam_type + ")" : ""}。\n档案摘要:\n${dossier || "(无)"}\n\n对每个栏目给 true(用得上、保留)/false(用不上、收起):\n- mock:限时全真【模拟考】——有一场正式考试/测验值得模考就 true;纯自学/纯技能、没考试→false。\n- prep:【屠杀准备】(考务/临场:带什么、时间分配、答题策略)——有正式考试→true;没考试→false。\n- performances:【表演回放】(录像作答+AI点评+重做)——【只有真正要录像/录音表现的:艺术/表演/口语口试/演讲/音乐/舞蹈/体育技能展示】才 true;凡是【笔试/做题/编程/数理/写论文】这类【非表演】的一律 false(这是最容易判错的一项,拿不准就 false)。\n- tasks:【实践作业】(动手做+判分:写代码、做实验、做项目、证明题、写作练习等)——只要这门考试【会有真动手做的部分】(编程/STEM/工程/数据/证明/写作/实验/项目)就 true;纯背诵/纯选择的才 false。\n- quizupload:【拍照/上传做题】(拍照或传题目文件识别后就地做)——【几乎所有有题目的笔试类考试都用得上,默认 true】;只有【纯表演类、根本不做书面题】的才 false。` + langInstruction(user?.lang),
      { type: "object", properties: { mock: { type: "boolean" }, prep: { type: "boolean" }, performances: { type: "boolean" }, tasks: { type: "boolean" }, quizupload: { type: "boolean" }, reason: { type: "string" } }, required: ["mock", "prep", "performances", "tasks"] });
    // 硬规则(防 AI 判错·除非用户明说,别删这些):
    const isPerf = exam.exam_type === "performance";
    let hasTasks = 0; try { hasTasks = db.prepare("SELECT COUNT(*) n FROM practical_tasks WHERE exam_id=?").get(exam.id)?.n || 0; } catch {}
    const decide = { ...out };
    // 表演回放:非表演类一律收起(最易判错);表演类才按 AI
    if (!isPerf) decide.performances = false;
    // 实践作业:已经有实践作业的,一定保留;否则按 AI(默认保留)
    if (hasTasks > 0) decide.tasks = true;
    // 拍照/上传做题:非表演类【一律保留】(Will:非艺术类别删拍照搜题,除非用户明说);表演类按 AI(默认保留)
    if (!isPerf) decide.quizupload = true;
    let pl = defaultPlacement();
    for (const fid of ["mock", "prep", "performances", "tasks", "quizupload"]) {
      const keep = decide[fid] !== false;   // 只有明确 false 才收起,拿不准就保留(保守)
      for (const bp of ["desktop", "mobile"]) {
        if (!keep) pl = applyMove(pl, bp, fid, "hidden");                    // 无关→收进隐藏
        else if (fid === "tasks") pl = applyMove(pl, bp, fid, "morefeatures"); // 相关的实践作业默认隐藏→凸显到更多功能
        // 其余保留时留默认位置,不挪
      }
    }
    setExamPlacement(exam.id, user?.id, pl, "按考试内容自动整理栏目(收起无关、保留相关)");
    return out;
  } catch { return null; }
}
