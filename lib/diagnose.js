// 类11 根因诊断(自动化):跨章节找根因知识点 + 反复错误模式 + 是否回避最难内容。
// 触发:累计使用时长满 2 小时后台自动跑一次(再清零);用户也可以让杀手随时跑(brick)。
// 副作用:给根因知识点在掌握度矩阵加醒目标记(knowledge_points.root_cause)、写进长期记忆、置首页横幅提醒。
import db, { examScope, scopeSql, getSetting, setSetting } from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";
import { masteryMatrix, invalidateKnowledgeState } from "@/lib/mastery";
import { addFact } from "@/lib/memory";
import { activeModesDigest } from "@/lib/learningModes";

const USAGE_KEY = (uid) => "diag_usage_sec:" + uid;
const LASTACT_KEY = (uid) => "diag_last_act:" + uid;
const BANNER_KEY = (uid) => "diag_banner:" + uid;
const STORE_KEY = (eid) => "diagnosis:" + eid;
const ENABLED_KEY = (uid) => "diag_auto:" + uid;       // "0" 关闭自动触发
const INTERVAL_KEY = (uid) => "diag_interval_sec:" + uid;
const DEFAULT_SEC = 2 * 3600;   // 默认 2 小时
const MIN_SEC = 90 * 60;        // 下限 1.5 小时(硬性)

// 读/写「是否自动触发 + 间隔」——供杀手 brick 调整。间隔强制不低于 1.5 小时。
export function getDiagnosisConfig(userId) {
  let enabled = true, sec = DEFAULT_SEC;
  try { enabled = getSetting(ENABLED_KEY(userId)) !== "0"; } catch {}
  try { const v = Number(getSetting(INTERVAL_KEY(userId))); if (v) sec = v; } catch {}
  sec = Math.max(MIN_SEC, sec);
  return { enabled, intervalSec: sec, intervalMinutes: Math.round(sec / 60), minMinutes: MIN_SEC / 60 };
}
export function setDiagnosisConfig(userId, { enabled, intervalMinutes } = {}) {
  if (typeof enabled === "boolean") { try { setSetting(ENABLED_KEY(userId), enabled ? "1" : "0"); } catch {} }
  if (intervalMinutes != null && !isNaN(Number(intervalMinutes))) {
    const sec = Math.max(MIN_SEC, Math.round(Number(intervalMinutes) * 60));
    try { setSetting(INTERVAL_KEY(userId), String(sec)); } catch {}
  }
  return getDiagnosisConfig(userId);
}

export function getBanner(userId, examId) {
  try {
    const raw = getSetting(BANNER_KEY(userId)); if (!raw) return null;
    const b = JSON.parse(raw);
    // 按当前考试家族过滤:诊断卡只在它所属的考试(家族)里显示,别串到别的考试首页
    if (examId != null && b && b.examId != null) {
      let scope = [Number(examId)];
      try { scope = examScope(examId); } catch {}
      if (!scope.map(Number).includes(Number(b.examId))) return null;
    }
    return b;
  } catch { return null; }
}
export function clearBanner(userId) { try { setSetting(BANNER_KEY(userId), ""); } catch {} }
export function getStoredDiagnosis(examId) {
  try { const s = getSetting(STORE_KEY(examId)); return s ? JSON.parse(s) : null; } catch { return null; }
}

// 累计使用时长:每次判分调用一次,加上「距上次活动的间隔(封顶 5 分钟,避免把挂机算进去)」。
// 满 2 小时就后台跑一次根因分析并清零。返回是否触发。
export function bumpUsageAndMaybeDiagnose(user, examId, { async = true } = {}) {
  try {
    const cfg = getDiagnosisConfig(user.id);
    if (!cfg.enabled) return false; // 用户通过杀手关掉了自动触发
    const now = Date.now();
    const last = Number(getSetting(LASTACT_KEY(user.id)) || 0);
    setSetting(LASTACT_KEY(user.id), String(now));
    let delta = last ? Math.round((now - last) / 1000) : 60;
    delta = Math.max(15, Math.min(300, delta)); // 15s ~ 5min
    let acc = Number(getSetting(USAGE_KEY(user.id)) || 0) + delta;
    if (acc >= cfg.intervalSec) {
      setSetting(USAGE_KEY(user.id), "0"); // 清零重新计时
      if (async) { runRootCauseDiagnosis(user, examId).catch(() => {}); return true; }
      return runRootCauseDiagnosis(user, examId).then(() => true);
    }
    setSetting(USAGE_KEY(user.id), String(acc));
    return false;
  } catch { return false; }
}

// 组装喂给模型的确定性信号(与之前 /api/diagnose 一致)。
function buildDigest(user, exam) {
  const scSql = scopeSql(examScope(exam.id));
  const matrix = masteryMatrix(exam.id);
  const attempted = matrix.filter((m) => m.attempts > 0);
  const kpLines = matrix.map((m) => `${m.chapter || "—"} / ${m.title}: ${m.level} ${m.accuracy}% (${m.attempts}题)`).join("\n");
  const chRows = db.prepare(`SELECT ch.title chapter, COUNT(*) n, SUM(a.correct) c
    FROM attempts a JOIN questions q ON q.id=a.question_id
    LEFT JOIN knowledge_points kp ON kp.id=q.kp_id LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id
    WHERE a.exam_id IN ${scSql} AND a.mode!='resolved' AND q.kp_id IS NOT NULL
    GROUP BY ch.title HAVING n>0 ORDER BY (1.0*SUM(a.correct)/COUNT(*)) ASC`).all();
  const chLines = chRows.map((r) => `${r.chapter || "—"}: ${Math.round(100 * (r.c || 0) / r.n)}% (${r.n}题)`).join("\n");
  const wrong = db.prepare(`SELECT a.tag, a.labels, q.body, q.qtype, kp.title kp_title, ch.title chapter
    FROM attempts a JOIN questions q ON q.id=a.question_id
    LEFT JOIN knowledge_points kp ON kp.id=q.kp_id LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id
    WHERE a.exam_id IN ${scSql} AND a.correct=0 AND a.mode!='resolved'
    ORDER BY a.created_at DESC LIMIT 40`).all();
  const wrongLines = wrong.map((w) => {
    let stem = ""; try { stem = (JSON.parse(w.body || "{}").stem || "").replace(/\s+/g, " ").slice(0, 90); } catch {}
    const tags = [w.tag, ...(() => { try { return (JSON.parse(w.labels || "[]") || []).map((l) => l.name); } catch { return []; } })()].filter(Boolean).join(",");
    return `[${w.chapter || "—"}/${w.kp_title || "?"}]${tags ? "{" + tags + "}" : ""} ${stem}`;
  }).join("\n");
  const avoid = matrix.filter((m) => m.level === "weak" || m.attempts === 0)
    .sort((a, b) => a.attempts - b.attempts).slice(0, 8)
    .map((m) => `${m.chapter || "—"} / ${m.title}: ${m.attempts}题`).join("\n");
  const insRows = db.prepare(`SELECT i.kind, i.text, kp.title kp_title, ch.title chapter
    FROM insights i LEFT JOIN knowledge_points kp ON kp.id=i.kp_id LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id
    WHERE i.exam_id IN ${scSql} AND i.kind IN ('gap','misconception') AND i.text IS NOT NULL
    ORDER BY i.created_at DESC LIMIT 25`).all();
  const insLines = insRows.map((r) => `[${r.chapter || "—"}/${r.kp_title || "?"}] ${(r.text || "").replace(/\s+/g, " ").slice(0, 110)}`).join("\n");
  const memRows = db.prepare(`SELECT subject, claim FROM memory_facts
    WHERE user_id=? AND active=1 AND valence='weak' AND (exam_id IN ${scSql} OR exam_id IS NULL)
    ORDER BY created_at DESC LIMIT 25`).all(user.id);
  const memLines = memRows.map((r) => `${r.subject || ""}: ${(r.claim || "").replace(/\s+/g, " ").slice(0, 100)}`).join("\n");
  let modesTxt = ""; try { modesTxt = (activeModesDigest(user.id, exam.id) || "").slice(0, 900); } catch {}
  return { attempted, matrix, kpLines, chLines, wrongLines, avoid, insLines, memLines, modesTxt };
}

// 把根因知识点在矩阵里加标记 + 写长期记忆。title 可能是「章节 / 知识点」,做宽松匹配。
function markRootCauses(user, exam, rootCauses) {
  const scSql = scopeSql(examScope(exam.id));
  try { db.prepare(`UPDATE knowledge_points SET root_cause=0 WHERE exam_id IN ${scSql}`).run(); } catch {}
  const marked = [];
  for (const rc of rootCauses || []) {
    const raw = String(rc.title || "").trim(); if (!raw) continue;
    const t = raw.includes(" / ") ? raw.split(" / ").pop().trim() : raw;
    let kp = db.prepare(`SELECT id,title FROM knowledge_points WHERE exam_id IN ${scSql} AND parent_id IS NOT NULL AND title=?`).get(t);
    if (!kp) kp = db.prepare(`SELECT id,title FROM knowledge_points WHERE exam_id IN ${scSql} AND parent_id IS NOT NULL AND (title LIKE ? OR ? LIKE '%'||title||'%') LIMIT 1`).get("%" + t.slice(0, 24) + "%", t);
    if (kp) {
      try { db.prepare("UPDATE knowledge_points SET root_cause=1 WHERE id=?").run(kp.id); marked.push(kp.title); } catch {}
      try { addFact(user.id, exam.id, { subject: kp.title.slice(0, 40), kind: "observation", claim: ("根因:" + (rc.why || kp.title)).slice(0, 300), valence: "weak", scope: "exam" }); } catch {}
    }
  }
  return marked;
}

export async function runRootCauseDiagnosis(user, examId) {
  const exam = db.prepare("SELECT * FROM exams WHERE id=? AND user_id=? AND deleted_at IS NULL").get(Number(examId), user.id);
  if (!exam) return { diagnosis: null, reason: "no_exam" };
  const dg = buildDigest(user, exam);
  if (dg.attempted.length < 3 && !dg.insLines && !dg.memLines) return { diagnosis: null, reason: "no_data" };
  const out = await generateJson(
    `你是「${exam.name}」的备考诊断师。下面是考生的真实数据(错题、掌握度、追问/争论暴露的缺口、长期记忆里的细颗粒薄弱、以及生效的自定义学习模式)。请综合【全部】信号做跨章节根因分析,不要只看错题、也不要只按表面频率排:
1) rootCauses:1~3 个【最可能导致连锁失分的根因/前置知识点】——它薄弱会拖垮一片其它知识点,而不是表面错得最多的。title 必须来自下面知识点列表原文。why 说明它为何是根因、拖累了哪些章节。
2) errorPatterns:2~3 个反复错误模式,每个给一句 evidence 和一个具体 drill。
3) avoidance:{avoiding, detail} 是否在逃避最难/最弱内容。
4) summary:一句话最该做什么。
只依据给出的数据,不要编造不存在的知识点。

【掌握度】\n${dg.kpLines.slice(0, 3500)}
【章节正确率(低→高)】\n${dg.chLines.slice(0, 800)}
【最近错题】\n${dg.wrongLines.slice(0, 2500)}
【疑似回避】\n${dg.avoid.slice(0, 800)}
${dg.insLines ? "【追问/争论暴露的理解缺口(即使答对也算根因信号)】\n" + dg.insLines.slice(0, 1800) + "\n" : ""}${dg.memLines ? "【长期记忆里的细颗粒薄弱(含自定义标记)】\n" + dg.memLines.slice(0, 1200) + "\n" : ""}${dg.modesTxt ? "【生效的自定义学习模式规则(在此语境下解读)】\n" + dg.modesTxt + "\n" : ""}` + langInstruction(user.lang),
    { type: "object", properties: {
      rootCauses: { type: "array", items: { type: "object", properties: { title: { type: "string" }, chapter: { type: "string" }, why: { type: "string" } }, required: ["title", "why"] } },
      errorPatterns: { type: "array", items: { type: "object", properties: { name: { type: "string" }, evidence: { type: "string" }, drill: { type: "string" } }, required: ["name", "drill"] } },
      avoidance: { type: "object", properties: { avoiding: { type: "boolean" }, detail: { type: "string" } }, required: ["avoiding"] },
      summary: { type: "string" }
    }, required: ["rootCauses", "errorPatterns", "avoidance", "summary"] }
  );
  if (out) {
    const marked = markRootCauses(user, exam, out.rootCauses);
    try { setSetting(STORE_KEY(exam.id), JSON.stringify({ ...out, at: Date.now() })); } catch {}
    try { setSetting(BANNER_KEY(user.id), JSON.stringify({ examId: exam.id, examName: exam.name, summary: out.summary || "", markedCount: marked.length, at: Date.now() })); } catch {}
    try { invalidateKnowledgeState(exam.id); } catch {}
  }
  return { diagnosis: out };
}
