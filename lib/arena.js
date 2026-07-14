// 类14 游戏化学习形式(怪学习形式):把知识点/错题变成互动的 Boss 战 / 庭审 / 辩论赛。
// 由大模型扮演,喂真实内容(错题、薄弱知识点),每回合返回叙事 + 一个机器可读的 STATE 行来记血量/进度。
import db, { examScope, scopeSql } from "@/lib/db";
import { generate } from "@/lib/gemini";
import { masteryMatrix, recordCrossKp, updateReviewQueue } from "@/lib/mastery";

const LANG = (l) => ({ zh: "中文", en: "English", fr: "français", es: "español", ru: "русский", ar: "العربية", id: "Bahasa Indonesia" }[l] || "中文");

export const ARENA_MODES = {
  boss: { emoji: "🗡️", title: "错题 Boss 战" },
  trial: { emoji: "⚖️", title: "知识点庭审" },
  debate: { emoji: "🎤", title: "辩论赛" },
};

// 收集真实内容作为素材(错题 / 薄弱知识点)。
function buildSeed(exam, scope) {
  const scSql = scopeSql(examScope(exam.id));
  if (scope === "wrong") {
    const rows = db.prepare(
      `SELECT q.body, q.answer, q.kp_id, kp.title kptitle FROM attempts a JOIN questions q ON q.id=a.question_id
       LEFT JOIN knowledge_points kp ON kp.id=q.kp_id
       WHERE a.exam_id IN ${scSql} AND a.correct=0 ORDER BY a.id DESC LIMIT 10`
    ).all();
    const items = rows.map((r) => {
      let stem = "", ans = "";
      try { stem = (JSON.parse(r.body).stem || "").slice(0, 200); } catch {}
      try { ans = (JSON.parse(r.answer).answer || "").slice(0, 120); } catch {}
      return `- 题:${stem} | 正解:${ans}`;
    });
    const kps = []; const seen = new Set();
    for (const r of rows) { if (r.kp_id && r.kptitle && !seen.has(r.kp_id)) { seen.add(r.kp_id); kps.push({ id: r.kp_id, title: r.kptitle }); } }
    return { label: "你最近的错题", content: items.join("\n"), empty: items.length === 0, kps };
  }
  // weak（默认）：薄弱/一般知识点
  let mm = [];
  try { mm = masteryMatrix(exam.id); } catch {}
  const weak = mm.filter((m) => m.level === "weak" || m.level === "ok").slice(0, 14);
  const pool = (weak.length ? weak : mm.slice(0, 14));
  const items = pool.map((m) => `- ${m.chapter ? m.chapter + " / " : ""}${m.title}${m.level ? "（" + m.level + "）" : ""}`);
  return { label: "你的薄弱知识点", content: items.join("\n"), empty: items.length === 0, kps: pool.map((m) => ({ id: m.id, title: m.title })) };
}

function systemFor(mode, exam, seed, lang) {
  const kpLines = (seed.kps || []).slice(0, 30).map((k) => `[${k.id}] ${k.title}`).join("\n");
  const common = `本场对战素材(考生看不到这段,你要基于它出招/取材,内容要用真实知识点,不要瞎编）：\n【${seed.label}】\n${seed.content || "(素材不足，就围绕这门考试「" + exam.name + "」的核心内容展开)"}\n
铁律：
- 用${LANG(lang)}进行。沉浸、有戏剧感,但知识必须准确——绝不为了好玩而讲错。答案对错以事实为准。
- 每一回合你的回复分两部分:先是【叙事/角色台词】,然后【单独一行】输出机器状态:@@STATE {"meter":数字,"done":true或false,"win":true或false}。
- 状态行之后【再单独一行】输出本回合从考生【最新回应】里看出的、对下列真实知识点的掌握信号:@@KP [{"id":知识点id,"kind":"understanding"或"misconception"}]。真正答透某点=understanding;暴露明确概念错误=misconception;开场或看不出就给 @@KP []。id 只能取自下面清单,宁缺毋滥。这两行考生都看不到,不要加解释。
可引用的真实知识点(只能用这些 id):
${kpLines || "(暂无)"}
- 一次只推进一步,别一口气问一堆。等考生回应再继续。
- 如果考生答得好,给正反馈并推进;答错或含糊,以角色口吻点破、给正确理解,再给他机会。`;

  if (mode === "boss") {
    return `你是一场 RPG「错题 Boss 战」的地下城主(DM)。把考生的错题/薄弱点具象化成一只 Boss。
meter = Boss 剩余血量(0~100,开局 100)。考生每答对/答透一题,你判定造成伤害、扣血并叙述;答错则 Boss 反击(血量不降或略回)。血量归 0 时 done=true 且 win=true(考生胜)。
开场(第一回合,考生还没说话时):给 Boss 起个中二的名字、描述它的形态(由错题主题决定),然后甩出第一道「攻击」——一道基于真实错题/知识点的问题,让考生作答。meter 设 100,done=false。
${common}`;
  }
  if (mode === "trial") {
    return `你是一场「知识点庭审」的法官兼对方律师。选一个考生薄弱的知识点/概念作为「被审对象」,考生要作为辩方证明自己真的掌握了它。
meter = 考生的庭审优势(0~100,开局 50)。考生解释得清楚准确就上升,含糊或有概念错误就下降(你以对方律师身份犀利盘问、抓漏洞)。>=100 时 done=true,win=true(结案胜诉);<=0 时 done=true,win=false(败诉,并给出该补的点)。
开场:敲槌宣布今日受审的知识点是什么、控方指控考生"其实没真懂",然后提出第一个盘问问题。meter 设 50。
${common}`;
  }
  // debate
  return `你是一场「辩论赛」的对方辩手。围绕这门考试里一个有两面的观点/知识点,你持与考生【相反】的立场,针锋相对地反驳。
meter = 考生的说服力/占优程度(0~100,开局 50)。论证有力、用对知识就上升,漏洞被你抓住就下降。>=100 考生完胜 done=true win=true;<=0 考生被辩倒 done=true win=false。
开场:宣布辩题、亮出你的立场(与考生相反),抛出你的第一击论点,请考生反驳。meter 设 50。若某知识点本身没有争议,就把辩题设成"常见误解 vs 正确理解",你故意为误解辩护,逼考生用正确知识驳倒你。
${common}`;
}

// 跑一个回合。history: [{role:'user'|'assistant', content}]。返回 {reply, state}。
export async function arenaTurn(user, exam, { mode, scope, history }) {
  const m = ARENA_MODES[mode] ? mode : "boss";
  const seed = buildSeed(exam, scope === "wrong" ? "wrong" : "weak");
  const system = systemFor(m, exam, seed, user.lang);
  const contents = (history || []).map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: String(h.content || "") }] }));
  if (!contents.length) contents.push({ role: "user", parts: [{ text: "(开始吧)" }] });
  const res = await generate(null, { contents, system });
  let text = res.text || "";
  let state = null;
  const mt = text.match(/@@STATE\s*(\{[^}]*\})/);
  if (mt) { try { state = JSON.parse(mt[1]); } catch {} text = text.replace(mt[0], "").trim(); }
  const kt = text.match(/@@KP\s*(\[[^\]]*\])/);
  let signals = [];
  if (kt) { try { signals = JSON.parse(kt[1]); } catch {} text = text.replace(kt[0], "").trim(); }
  try { recordArenaSignals(exam, seed.kps || [], signals); } catch {}
  return { reply: text, state: state || {}, seedEmpty: seed.empty };
}

// A1:把竞技场里看出的知识点信号并入掌握度(insights),误区点还把该点的一道真题塞进错题本(review_queue)。
function recordArenaSignals(exam, kps, signals) {
  if (!Array.isArray(signals) || !signals.length) return;
  const validIds = new Set(kps.map((k) => k.id));
  const cross = signals.filter((s) => validIds.has(Number(s.id)) && (s.kind === "understanding" || s.kind === "misconception"))
    .map((s) => ({ kpId: Number(s.id), kind: s.kind, insight: s.kind === "understanding" ? "竞技场对战中答透了这个点" : "竞技场对战中暴露出这个点的概念错误" }));
  if (!cross.length) return;
  try { recordCrossKp(exam.id, null, cross, null); } catch {}         // 并入掌握度(变绿/变红)
  const scSql = scopeSql(examScope(exam.id));
  for (const c of cross) {
    if (c.kind !== "misconception") continue;
    try {
      const q = db.prepare(`SELECT id FROM questions WHERE kp_id=? AND exam_id IN ${scSql} ORDER BY RANDOM() LIMIT 1`).get(c.kpId);
      if (q) updateReviewQueue(q.id, false);                          // 该点的一道真题进错题本,明天到期重练
    } catch {}
  }
}
