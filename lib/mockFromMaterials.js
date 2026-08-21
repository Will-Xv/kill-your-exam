// 【按指定资料出卷】(2026-08,Will 定)
// 取代原来那个名不副实的「做真题」:与其从一个多数人是空的"真题池"里抽,不如让主人
// 【自己勾选从哪几份资料出题】,并且【对出题的 AI 提要求】(侧重什么、只出哪类题、难度…)。
//
// 依据来源:优先用这些资料的 chunks(入库时已用 Gemini 多模态真读过、按页分节建好索引);
// 有额外要求就拿它当检索 query 命中最相关的段落,没有就均匀取样,保证覆盖到整份资料。
// ★不整份投喂原件:那是之前 token 爆炸的根源;这里只送命中的文字段落。
import db, { familyScope, scopeSql } from "@/lib/db";
import { generateJson, langInstruction, embed, cosine } from "@/lib/gemini";
import { leafKpList } from "@/lib/mastery";
import { retrieve, materialFilePart } from "@/lib/rag";
import crypto from "crypto";
import { DEFAULT_MARKS } from "@/lib/blueprint";

const qSchema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
  qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] },
  stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
  answer: { type: "string" }, explanation: { type: "string" }, difficulty: { type: "integer" },
}, required: ["qtype", "stem", "explanation", "difficulty"] } } }, required: ["questions"] };

// 从选中的资料里取出用于出题的文字依据
async function gatherBasis(examId, materialIds, request) {
  const ph = materialIds.map(() => "?").join(",");
  let rows = [];
  // 有要求 → 先按要求检索,只取命中这些资料的段落(更贴主人的意图)
  if (request && request.trim()) {
    try {
      const hits = await retrieve(examId, request.slice(0, 300), 30);
      rows = hits.filter((h) => materialIds.includes(Number(h.material_id)))
                 .map((h) => ({ content: h.content, heading_path: h.heading_path, material_id: h.material_id }));
    } catch {}
  }
  // 不够就从这些资料里均匀补齐,保证覆盖整份而不是只盯着开头
  if (rows.length < 12) {
    try {
      const all = db.prepare(`SELECT content, heading_path, material_id FROM chunks
        WHERE material_id IN (${ph}) AND exam_id IN ${scopeSql(familyScope(examId))} ORDER BY material_id, id`).all(...materialIds);
      const step = Math.max(1, Math.floor(all.length / 24));
      for (let i = 0; i < all.length && rows.length < 24; i += step) {
        const c = all[i];
        if (!rows.some((r) => r.content === c.content)) rows.push(c);
      }
    } catch {}
  }
  return rows;
}

export async function composeFromMaterials(exam, user, { materialIds, request = "", count = 10 }) {
  const ids = (materialIds || []).map(Number).filter(Boolean);
  if (!ids.length) return { error: "no_material" };
  const names = db.prepare(`SELECT id, filename, status FROM materials WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
  const basis = await gatherBasis(exam.id, ids, request);
  if (!basis.length) {
    // 如实说明:多半是这几份资料还没建好索引(刚上传/建索引失败),而不是"出题失败"
    return { error: "no_basis", files: names.map((n) => n.filename) };
  }
  const basisText = basis.map((b, i) => `[${i + 1}] ${b.heading_path ? b.heading_path + " " : ""}${String(b.content).slice(0, 900)}`).join("\n\n").slice(0, 24000);
  const n = Math.max(1, Math.min(40, Number(count) || 10));
  const prompt = `你在为考生「${exam.name}」出一套卷子。【只依据下面这些资料原文出题】,不要引入资料以外的内容,也不要编造数字。
出 ${n} 道题,题型可混合(single 单选/multi 多选/judge 判断/fill 填空/short 简答)。
${request && request.trim() ? `★【考生对这套卷子的要求·最优先】${String(request).slice(0, 600)}\n若这个要求与下面的默认规则冲突,以考生的要求为准。` : ""}
默认规则:【每道题都要有代表性】——出这份资料里最该考的核心考法、最典型的设问方式,
不要挑边角料(冷僻定义、一笔带过的细节、纯记忆的年份编号都不要),也不要为了新鲜而故意刁钻;
资料里若含历年真题/样卷/考纲,照它们的考法和难度出。题目要能真正检验理解、不要只考死记;single/multi 给 4 个选项,answer 写字母(多选如 AC);
judge 的 answer 写「对」或「错」;fill 写标准答案;short 写评分要点;explanation 每道题都要写(选择题也要:正确项为什么对、其他项错在哪);difficulty 1~3。
同一套里不要重复考同一个点,也不要在题干里泄露别题答案。
数学公式必须用标准 LaTeX 并用 $...$ 包裹(如 $\\frac{a}{b}$、$\\lim_{h\\to 0}$),【务必带反斜杠命令】,不要写成裸词。

【资料原文(依据只能来自这里)】
${basisText}` + langInstruction(user.lang);

  let out;
  try { out = await generateJson(prompt, qSchema); }
  catch (e) { return { error: "ai_failed" }; }
  const list = (out.questions || []).slice(0, n).filter((q) => q && q.stem);
  if (!list.length) return { error: "empty" };

  // 绑知识点(供掌握度统计):按题干语义就近匹配一个叶子知识点
  const kps = (() => { try { return leafKpList(exam.id); } catch { return []; } })();
  let kv = [];
  try { if (kps.length) kv = await embed(kps.map((k) => k.title)); } catch {}

  const ins = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin) VALUES(?,?,?,?,?,?,?,?,?,?)");
  const picked = [];
  for (const q of list) {
    let kpId = null;
    if (kv.length) {
      try { const [qv] = await embed([String(q.stem).slice(0, 200)]); let best = -1, bi = -1; kv.forEach((v, i) => { const sc = cosine(qv, v); if (sc > best) { best = sc; bi = i; } }); if (bi >= 0) kpId = kps[bi].id; } catch {}
    }
    const body = JSON.stringify({ stem: q.stem, options: q.options || [] });
    const ans = JSON.stringify({ answer: q.answer || "", explanation: q.explanation || "" });
    const info = ins.run(exam.id, kpId, q.qtype, body, ans, q.difficulty || 2, "material", JSON.stringify(ids.map((x) => ({ material_id: x }))), "generated", "ai");
    picked.push({ id: info.lastInsertRowid, kp_id: kpId, qtype: q.qtype, body: JSON.parse(body) });
  }
  const marks = {}; picked.forEach((q) => { marks[q.id] = DEFAULT_MARKS[q.qtype] ?? 2; });
  const totalMarks = picked.reduce((s, q) => s + (marks[q.id] || 0), 0);
  const mock = db.prepare("INSERT INTO mock_exams(exam_id,config_json) VALUES(?,?)")
    .run(exam.id, JSON.stringify({ questionIds: picked.map((q) => q.id), marks, totalMarks, mode: "materials", materialIds: ids, durationMin: Number(exam.duration_min) > 0 ? Math.round(Number(exam.duration_min)) : null, request: String(request || "").slice(0, 600), createdAt: Date.now() }));
  // 限时:用这门考试【记录在案的真实时长】;没有就不限时(绝不编一个假时长)
  const durationMin = Number(exam.duration_min) > 0 ? Math.round(Number(exam.duration_min)) : null;
  return { mockId: mock.lastInsertRowid, totalMarks, durationMin, questions: picked.map((q) => ({ ...q, marks: marks[q.id] })), files: names.map((x) => x.filename) };
}

// ——— 追加到 lib/mockFromMaterials.js 末尾 ———

// 【做原题】(2026-08,Will 定)
// 与「按资料出卷」的区别,一句话:这边是【把卷子里现成的题原样搬出来】,那边是【照着资料另出新题】。
// 为什么必须单开一条路:摘原题只能读【原件】。资料入库时,PDF/图片走的是"按页要点"索引
// (lib/parse.js 对 PDF/图片有意返回空文本),chunks 里根本没有题目原文 —— 拿 chunks 摘题必然摘出个四不像。
// 所以这里把选中资料的原件直接交给模型识读,和「上传做题」是同一套抄题规格(那条路已经跑熟了)。
// 【只花一次钱】摘出来的题按 fixed_key='mat{资料id}:{题干指纹}' 入库;下次再选同一份文件出卷,
// 直接命中已入库的题,零 token、且每次出的是同一批题(卷子本来就该是固定的)。
export async function extractPaperFromMaterials(exam, user, { materialIds, request = "", count = 0 }) {
  const ids = (materialIds || []).map(Number).filter(Boolean);
  if (!ids.length) return { error: "no_material" };
  const ph = ids.map(() => "?").join(",");
  const mats = db.prepare(`SELECT id, filename, kind, mime, status, stored FROM materials
    WHERE id IN (${ph}) AND exam_id IN ${scopeSql(familyScope(exam.id))}`).all(...ids);
  if (!mats.length) return { error: "no_material" };

  const keyOf = (mid, stem) => `mat${mid}:${crypto.createHash("sha1").update(String(stem).replace(/\s+/g, "").slice(0, 200)).digest("hex").slice(0, 16)}`;
  const already = (mid) => db.prepare("SELECT * FROM questions WHERE exam_id=? AND flagged=0 AND fixed_key LIKE ? ORDER BY id ASC").all(exam.id, `mat${mid}:%`);

  const kps = (() => { try { return leafKpList(exam.id); } catch { return []; } })();
  let kv = [];
  const needKv = mats.some((m) => already(m.id).length === 0);
  if (needKv && kps.length) { try { kv = await embed(kps.map((k) => k.title)); } catch {} }

  const out = [];          // 这次卷子用的题
  const perFile = [];      // 每份资料摘到几道,用来如实汇报
  const failed = [];

  for (const m of mats) {
    const done = already(m.id);
    if (done.length) { out.push(...done); perFile.push({ filename: m.filename, n: done.length, cached: true }); continue; }
    if (!(m.status === "ready" && m.stored)) { failed.push({ filename: m.filename, why: "not_ready" }); continue; }
    let part = null;
    try { part = await materialFilePart(m); } catch {}
    if (!part) { failed.push({ filename: m.filename, why: "unreadable" }); continue; }

    const prompt = extractPrompt(request, user.lang);
    let list = [];
    try {
      const res = await generateJson(prompt, extractSchema, { contents: [{ role: "user", parts: [{ text: prompt }, part] }] });
      list = Array.isArray(res.questions) ? res.questions : [];
    } catch (e) { failed.push({ filename: m.filename, why: String((e && e.message) || e).slice(0, 120) }); continue; }
    if (!list.length) { failed.push({ filename: m.filename, why: "no_question_found" }); continue; }

    const ins = db.prepare(`INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,is_real,fixed_key)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    let n = 0;
    for (const q of list) {
      const stem = String(q.stem || "").trim();
      if (!stem) continue;
      const key = keyOf(m.id, stem);
      if (db.prepare("SELECT id FROM questions WHERE exam_id=? AND fixed_key=?").get(exam.id, key)) continue;
      let kpId = null;
      if (kv.length) {
        try { const [qv] = await embed([stem.slice(0, 200)]); let best = -1, bi = -1; kv.forEach((v, i) => { const sc = cosine(qv, v); if (sc > best) { best = sc; bi = i; } }); if (bi >= 0) kpId = kps[bi].id; } catch {}
      }
      const qtype = ["single", "multi", "judge", "fill", "short"].includes(q.qtype) ? q.qtype : "short";
      const body = JSON.stringify({ stem, options: Array.isArray(q.options) ? q.options : [] });
      const ans = JSON.stringify({ answer: String(q.answer || ""), explanation: String(q.explanation || "") });
      // origin='fixed' = 用户题库里的原题:模拟考/小测的"可复用白名单"认这个标记,以后不必重复解析同一份卷子。
      // is_real 只在文件本身就是历年真题时才置 1(模型判断),模拟卷/练习册不冒充真题。
      try {
        const info = ins.run(exam.id, kpId, qtype, body, ans, q.difficulty || 2, "material",
          JSON.stringify([{ material_id: m.id, filename: m.filename }]), "fixed", q.answerFromFile ? "provided" : "ai", q.isPastPaper ? 1 : 0, key);
        out.push(db.prepare("SELECT * FROM questions WHERE id=?").get(info.lastInsertRowid));
        n++;
      } catch {}
    }
    perFile.push({ filename: m.filename, n, cached: false });
  }

  if (!out.length) return { error: "no_question", files: mats.map((m) => m.filename), failed };

  const picked = count > 0 ? out.slice(0, count) : out;
  const marks = {}; picked.forEach((q) => { marks[q.id] = DEFAULT_MARKS[q.qtype] ?? 2; });
  const totalMarks = picked.reduce((s, q) => s + (marks[q.id] || 0), 0);
  const durationMin = Number(exam.duration_min) > 0 ? Math.round(Number(exam.duration_min)) : null;
  const mock = db.prepare("INSERT INTO mock_exams(exam_id,config_json) VALUES(?,?)")
    .run(exam.id, JSON.stringify({ questionIds: picked.map((q) => q.id), marks, totalMarks, mode: "original", materialIds: ids, durationMin, createdAt: Date.now() }));
  return {
    mockId: mock.lastInsertRowid, totalMarks, durationMin, original: true,
    questions: picked.map((q) => ({ id: q.id, kp_id: q.kp_id, qtype: q.qtype, body: JSON.parse(q.body), marks: marks[q.id] })),
    files: mats.map((m) => m.filename), perFile, failed, extra: Math.max(0, out.length - picked.length),
  };
}

const extractSchema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
  qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] },
  stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
  answer: { type: "string" }, explanation: { type: "string" }, difficulty: { type: "integer" },
  answerFromFile: { type: "boolean" }, isPastPaper: { type: "boolean" }
}, required: ["qtype", "stem", "answer", "explanation"] } } }, required: ["questions"] };

// 抄题规格:和「上传做题」用的是同一套(那条路已经跑熟,别再造第二种写法)。
// 核心红线只有一条:【原样搬,不改写、不新编】—— 用户点「做原题」就是要做卷子上那道题本身。
function extractPrompt(request, lang) {
  return `这是一份【卷子/题目】文件。请把里面的每一道题【原样识别出来】,一道不漏,也【绝对不要自己新编题目】。

★【最高红线 · 原样搬运】题干、选项都要照抄原文,一字不差(可以去掉题号)。
  不要改写、不要"润色"、不要换数字、不要把两道题合并成一道、更不要凭空补一道原文没有的题。
  文件里没有题(是讲义、课本、笔记之类)就返回空数组 —— 空着是正确答案,编题才是错。

★【一道大题下面有多个小问的,算【一道题】,绝对不要拆开】——这是最容易出错的地方。
  典型形态:「3. 设 f(x)=… (1) 求… (2) 求… (3) 证明…」,或「阅读下面材料,回答问题:①… ②…」。
  拆开会出大事:小问离开了大题主干(那个"设 f(x)=…"、那段材料、那张图表)就【看不懂、也没法作答】。
  正确做法:把【大题主干 + 全部小问】原样合并进【同一个 stem】,保留 (1)(2)(3) 的编号;
  ★各小问之间用【空行】隔开(写成 "…主干…\\n\\n(1) …\\n\\n(2) …"),因为 Markdown 里单个换行不会换行。
  qtype 取能覆盖整题的那种(通常是 short);answer 按同样的编号逐条列全、同样用空行隔开。

对每道题:
- qtype: single(单选)/multi(多选)/judge(判断)/fill(填空)/short(简答),按题目实际形态判断。
- stem: 题干原文。【必须是正常文字、单词之间保留空格】。数学用行内 $...$ 只包【公式本身】、且用正确 LaTeX(\\sqrt{}、^、\\frac{}{});【绝对不要把整句话或普通单词包进 $...$】。
- options: 选择题的每个选项内容(不要带 "A." 前缀);判断/填空/简答留空数组。
- answer: 这道题的正确答案。文件给了答案就照抄;【文件没给答案,你要自己把题解出来】(单/多选写字母如 "A"/"AC";判断写"对"/"错")。要给用户判分用,绝不能空。
- explanation: 简短解析,每道题都要有(原文有就照抄,没有就自己补;选择题说明正确项为什么对、其他项错在哪)。
- answerFromFile: 答案是不是文件里本来就给了(给了 true;你自己解出来的 false)。
- isPastPaper: 这份文件看着是不是【历年真题/正式考卷】(有年份、考试名称、正式卷头等)。像模拟卷、练习册、习题集就填 false,不要拔高。
- difficulty: 1~3。
${request && String(request).trim() ? `\n★【用户对挑哪些题的要求 · 优先遵守】${String(request).slice(0, 600)}\n只挑符合这个要求的题;仍然是原样搬运,不因为这个要求而改写或新编。` : ""}` + langInstruction(lang);
}
