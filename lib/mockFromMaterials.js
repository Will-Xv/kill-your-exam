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
import { retrieve } from "@/lib/rag";
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
