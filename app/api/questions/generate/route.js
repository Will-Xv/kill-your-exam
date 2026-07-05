import db, { getDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { retrieve, ragBlock, materialParts } from "@/lib/rag";
import { getOverallDoc } from "@/lib/overall";
import { generateJson, searchWeb, langInstruction, examLangInstruction } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";

const genSchema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
  qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short", "perform"] }, stem: { type: "string" },
  options: { type: "array", items: { type: "string" } }, answer: { type: "string" }, explanation: { type: "string" }, difficulty: { type: "integer" },
  perform: { type: "object", properties: { captureType: { type: "string", enum: ["audio", "video"] }, mediaMaterialId: { type: "integer" }, countdownSec: { type: "integer" }, autoStopAfterMediaSec: { type: "integer" }, rubric: { type: "array", items: { type: "string" } }, instructions: { type: "string" } } }
}, required: ["qtype", "stem", "difficulty"] } } }, required: ["questions"] };

const onlineSchema = { type: "object", properties: {
  found: { type: "array", items: { type: "object", properties: {
    qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] }, stem: { type: "string" },
    options: { type: "array", items: { type: "string" } }, answer: { type: "string" }, explanation: { type: "string" },
    sourceUrl: { type: "string" }, isReal: { type: "boolean" }, hasAnswer: { type: "boolean" }
  }, required: ["qtype", "stem", "sourceUrl", "isReal", "hasAnswer"] } },
  note: { type: "string", description: "若该知识点必须借助图像/音频才能考、纯文字无法呈现,在此说明;否则留空" }
}, required: ["found"] };

async function searchOnline(exam, kp, chapter, count, lang) {
  try {
    const s = await searchWeb(`搜索「${exam.name}」中关于「${chapter} ${kp.title}」的历年真题或在线练习题(带题目和选项/答案)。用中文汇总你在搜索结果里找到的具体题目。`);
    if (!s.text || s.text.length < 60) return { found: [], note: "" };
    const out = await generateJson(
      `下面是关于「${exam.name} - ${kp.title}」的联网搜索结果。请从中提取【确实存在于搜索结果里的】练习题(最多 ${count} 道),每题给出 sourceUrl(来源网址)、isReal(是否为历年真题/官方题)、hasAnswer(搜索结果里是否给了答案)。
- 只提取你确实看到的题,绝不要凭空编造或改写成新题;找不到就 found 为空。
- 若某题搜索结果里没有答案(hasAnswer=false),你可以在 answer/explanation 里补上你判断的正确答案并说明"答案为AI推断"。
- 若这个知识点必须借助图像/音频才能考(纯文字无法呈现),在 note 里说明。
数学公式用 $...$ 包裹。
搜索结果:\n${s.text.slice(0, 6000)}` + langInstruction(lang),
      onlineSchema);
    return out;
  } catch { return { found: [], note: "" }; }
}

export async function POST(req) {
  try {
    const { kpId, count = 5, reuse = true } = await req.json();
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no exam" }, { status: 400 });

    const results = [];
    // 1) 题库复用(未答过的)
    if (reuse) {
      const pool = db.prepare(`SELECT * FROM questions WHERE exam_id=? AND flagged=0 ${kpId ? "AND kp_id=" + Number(kpId) : ""}
        AND id NOT IN (SELECT question_id FROM attempts) ORDER BY (is_real) DESC, (origin='online') DESC, RANDOM() LIMIT ?`).all(exam.id, count);
      results.push(...pool);
      if (results.length >= count) return Response.json({ questions: results.slice(0, count).map(pub) });
    }

    let kp = kpId ? db.prepare("SELECT * FROM knowledge_points WHERE id=?").get(kpId) : null;
    if (!kp) kp = db.prepare(`SELECT kp.* FROM knowledge_points kp WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL ORDER BY (SELECT COUNT(*) FROM attempts a WHERE a.kp_id=kp.id) ASC, RANDOM() LIMIT 1`).get(exam.id);
    if (!kp) return Response.json({ error: "还没有知识点,请先完成考试设置" }, { status: 400 });
    const chapter = kp.parent_id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kp.parent_id)?.title : "";
    const insQ = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,source_url,is_real) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
    let honesty = "";
    const need = count - results.length;

    if (need > 0) {
      // 多出几道存进题库,下次直接命中、无需再等 AI(出题提速)
      const genCount = Math.max(need + 3, 5);
      const hits = await retrieve(exam.id, `${chapter} ${kp.title}`, 5);
      const dossier = getDocument(exam.id, "dossier")?.content_md || "";
      const overallSnip = (getOverallDoc(user) || "").slice(0, 1000);
      let lessons = ""; try { lessons = db.prepare("SELECT text FROM gen_lessons WHERE exam_id=? ORDER BY id DESC LIMIT 12").all(exam.id).map((x) => "- " + x.text).join("\n"); } catch {}
      let qaAnswers = ""; try { const cl = JSON.parse(exam.checklist || "[]"); qaAnswers = cl.filter((c) => c.kind === "qa" && c.answer).map((c) => `${c.item}: ${c.answer}`).join("; "); } catch {}
      const sourceType = hits.length ? "material" : "model";
      const mparts = materialParts(exam.id, { kinds: ["image", "audio"], max: 4 });
      const audioMats = db.prepare("SELECT id, filename FROM materials WHERE exam_id=? AND kind='audio' AND status='ready'").all(exam.id);
      const audioList = audioMats.map((m) => `[${m.id}] ${m.filename}`).join(" ; ");
      const performBlock = `\n【表演/技能类】若这门考试考的是表演/技能(表演、播音主持、舞蹈、声乐、朗诵、口语、演讲等),可出 qtype="perform" 的表演任务题(考生用录音或录像作答),按真实考试规则设计 perform 字段:captureType(audio 录音 / video 录像)、mediaMaterialId(要播放的音频素材 id,从下面列表选,没有就填 0)、countdownSec(开始前倒计时,一般 3)、autoStopAfterMediaSec(所放音频结束后再录几秒自动停,一般 7;无音频则当作固定录制时长)、rubric(评分维度数组)、instructions(给考生的说明);stem 写命题(如"跟随所给音乐即兴舞蹈")。可选音频素材:${audioList || "(暂无,mediaMaterialId 填 0)"}。纯知识类考试【不要】出 perform。`;

      // 在线搜题 与 生成兜底 并行,减少等待时间
      const genPrompt = `为「${exam.name}」出 ${genCount} 道练习题,考察「${kp.title}」(章节:${chapter})。题型混合,以客观题为主。
${hits.length ? "必须依据以下资料:\n" + ragBlock(hits) : "无资料支撑,只出保守的基本概念题,不要编造具体数字或条款。"}
考试档案摘要:${dossier.slice(0, 1500)}${qaAnswers ? "\n考生背景:" + qaAnswers : ""}${overallSnip ? "\n考生整体画像(跨所有考试):" + overallSnip : ""}
single/multi给4选项、answer写字母;judge写"对"/"错"(中文);fill写标准答案;short写评分要点;explanation解释;difficulty 1~3。
数学公式用 $...$ 包裹,不要裸露反斜杠命令。
【只出知识性题】严禁答题技巧/应试策略题、考试规则事务题。${mparts.length ? "\n【多模态】本考试有图片/音频原件(见附件),鼓励据此出听力/看图题:题干注明「请听/看附件」,答案依据附件;同一音频可出多套。" : "严禁需真实感官或图音的技能题。"}
【防泄题】组内不得答案泄露、不要高度相似。${lessons ? "\n【避免已知毛病】\n" + lessons : ""}` + (mparts.length ? "\n考生资料库中的图片/音频原件已作为附件提供,可据此出题。" : "") + performBlock + examLangInstruction();
      const genPromise = generateJson(genPrompt, genSchema, mparts.length ? { contents: [{ role: "user", parts: [{ text: genPrompt }, ...mparts] }] } : {}).catch(() => ({ questions: [] }));
      const onlinePromise = searchOnline(exam, kp, chapter, need, user.lang).catch(() => ({ found: [], note: "" }));
      const [online, out] = await Promise.all([onlinePromise, genPromise]);
      if (online.note) honesty = online.note;

      // 先放真题/在线题(命中优先),再放生成题补足;多余的生成题也入库供下次复用
      const onlineQs = [];
      for (const q of (online.found || [])) {
        if (!q.stem || !q.answer) continue;
        const info = insQ.run(exam.id, kp.id, q.qtype, JSON.stringify({ stem: q.stem, options: q.options || [] }),
          JSON.stringify({ answer: q.answer, explanation: q.explanation || "" }), 2, "web", "[]",
          "online", q.hasAnswer ? "provided" : "ai", q.sourceUrl || null, q.isReal ? 1 : 0);
        onlineQs.push(db.prepare("SELECT * FROM questions WHERE id=?").get(info.lastInsertRowid));
      }
      const refs = JSON.stringify(hits.map((h) => ({ chunk_id: h.id, filename: h.filename, heading: h.heading_path })));
      const genQs = [];
      for (const q of (out.questions || [])) {
        if (!q.stem) continue;
        if (q.qtype === "perform") {
          const p = q.perform || {};
          const body = JSON.stringify({ stem: q.stem, captureType: p.captureType === "video" ? "video" : "audio", mediaMaterialId: p.mediaMaterialId || null, countdownSec: p.countdownSec || 3, autoStopAfterMediaSec: p.autoStopAfterMediaSec || 7, maxDurationSec: 300, rubric: p.rubric || [], instructions: p.instructions || "" });
          const answer = JSON.stringify({ rubric: p.rubric || [], notes: q.explanation || "" });
          const info = insQ.run(exam.id, kp.id, "perform", body, answer, q.difficulty || 2, sourceType, refs, "generated", "ai", null, 0);
          genQs.push(db.prepare("SELECT * FROM questions WHERE id=?").get(info.lastInsertRowid));
          continue;
        }
        if (!q.answer) continue;
        const info = insQ.run(exam.id, kp.id, q.qtype, JSON.stringify({ stem: q.stem, options: q.options || [] }),
          JSON.stringify({ answer: q.answer, explanation: q.explanation }), q.difficulty || 2, sourceType, refs, "generated", "ai", null, 0);
        genQs.push(db.prepare("SELECT * FROM questions WHERE id=?").get(info.lastInsertRowid));
      }
      // 本轮返回:先真题后生成,补足到 need;剩下的留在题库
      for (const q of [...onlineQs, ...genQs]) {
        if (results.length >= count) break;
        results.push(q);
      }
    }

    if (!results.length) return Response.json({ questions: [], note: honesty || "这个知识点暂时没有合适的题(可能需要图像/音频,AI 无法用文字出题)。" });
    return Response.json({ questions: results.slice(0, count).map(pub), kp: { id: kp.id, title: kp.title }, note: honesty || null });
  } catch (e) { return aiErrorResponse(e); }
}

function pub(q) {
  return { id: q.id, kp_id: q.kp_id, qtype: q.qtype, body: JSON.parse(q.body), difficulty: q.difficulty,
    source_type: q.source_type, source_refs: q.source_refs,
    origin: q.origin || "generated", answer_origin: q.answer_origin || "ai", source_url: q.source_url || null, is_real: !!q.is_real };
}
