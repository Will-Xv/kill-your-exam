import db, { getDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { retrieve, ragBlock, materialParts } from "@/lib/rag";
import { getOverallDoc } from "@/lib/overall";
import { generateJson, searchWeb, langInstruction, examLangInstruction } from "@/lib/gemini";
import { aiErrorResponse, AiError } from "@/lib/errors";
import { resolveExamLang } from "@/lib/examlang";
import { findAndStoreMusic, alignStemToMusic } from "@/lib/music";

const genSchema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
  qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short", "perform"] }, stem: { type: "string" },
  options: { type: "array", items: { type: "string" } }, answer: { type: "string" }, explanation: { type: "string" }, difficulty: { type: "integer" },
  perform: { type: "object", properties: { captureType: { type: "string", enum: ["audio", "video"] }, mediaMaterialId: { type: "integer" }, analyzeAudio: { type: "string", enum: ["music", "recorded", "both"] }, countdownSec: { type: "integer" }, autoStopAfterMediaSec: { type: "integer" }, rubric: { type: "array", items: { type: "string" } }, instructions: { type: "string" } } }
}, required: ["qtype", "stem", "difficulty"] } } }, required: ["questions"] };

const performSchema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
  qtype: { type: "string", enum: ["perform"] }, stem: { type: "string" }, difficulty: { type: "integer" },
  perform: { type: "object", properties: { captureType: { type: "string", enum: ["audio", "video"] }, mediaMaterialId: { type: "integer" }, analyzeAudio: { type: "string", enum: ["music", "recorded", "both"] }, countdownSec: { type: "integer" }, autoStopAfterMediaSec: { type: "integer" }, rubric: { type: "array", items: { type: "string" } }, instructions: { type: "string" } }, required: ["captureType", "rubric"] }
}, required: ["qtype", "stem", "perform"] } } }, required: ["questions"] };

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

    // 表演/技能类:强制出录音录像题(练习页 + 题库复用都按此过滤)
    let otherNote = ""; try { const cl = JSON.parse(exam.checklist || "[]"); otherNote = (cl.find((c) => c.item === "其他文件或说明")?.answer || ""); } catch {}
    const noteText = `${otherNote} ${exam.notes || ""}`;
    const performOnly = /(只|仅)[^。;\n]{0,12}(音视频|视频|录音|录像|表演|演唱|朗诵|舞蹈|口语|弹奏|演奏)/.test(noteText)
      || /(不要|别出|不出|无需|不需要|不考|去掉)[^。;\n]{0,12}(选择|判断|填空|简答|笔试|客观|文字|理论)/.test(noteText)
      || /only[^.;\n]{0,24}(perform|record|video|audio|audition|sing|danc|speak|recit)/i.test(noteText);
    const perfExam = exam.exam_type === "performance";
    const perfOn = performOnly || perfExam;

    const results = [];
    // 1) 题库复用(未答过的)
    if (reuse) {
      const pool = db.prepare(`SELECT * FROM questions WHERE exam_id=? AND flagged=0 ${kpId ? "AND kp_id=" + Number(kpId) : ""} ${perfOn ? "AND qtype='perform'" : ""}
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
      const audioMats = db.prepare("SELECT id, filename FROM materials WHERE exam_id=? AND kind='audio' AND status='ready' AND COALESCE(auto,0)=0").all(exam.id);
      const audioList = audioMats.map((m) => `[${m.id}] ${m.filename}`).join(" ; ");
      const performBlock = `\n【表演/技能类】若这门考试考的是表演/技能(表演、播音主持、舞蹈、声乐、朗诵、口语、演讲等),可出 qtype="perform" 的表演任务题(考生用录音或录像作答),按真实考试规则设计 perform 字段:captureType(audio 录音 / video 录像)、mediaMaterialId(要播放的音频素材 id,从下面列表选,没有就填 0)、analyzeAudio(舞蹈/形体填 music=只用所给音乐原曲判断合拍、不单独分析录像里录到的原声;声乐/台词/朗诵/演讲填 recorded=分析录进去的人声;两者都要填 both)、countdownSec(开始前倒计时,一般 3)、autoStopAfterMediaSec(所放音频结束后再录几秒自动停,一般 7;无音频则当作固定录制时长)、rubric(评分维度数组)、instructions(给考生的说明);stem 写命题(如"跟随所给音乐即兴舞蹈")。【重要】给定音乐的题里,stem 和 instructions 都【不要】写死具体曲名、乐器或曲风(如"二胡古典曲""电子乐"),因为配乐由系统自动附上、风格未必一致;一律只说"所给音乐/上方试听的音乐"。可选音频素材:${audioList || "(暂无,mediaMaterialId 填 0)"}。纯知识类考试【不要】出 perform。`;

      const examLang = await resolveExamLang(exam);
      const langRule = examLang ? `\n【出题语言 · 必须遵守】题干、选项、标准答案、评分要点、解析全部用 ${examLang} 书写(这是这门考试真正考试时用的语言),不要用界面语言。` : examLangInstruction();
      let genPrompt, genSchemaUse;
      if (perfOn) {
        genSchemaUse = performSchema;
        genPrompt = `【只出表演任务题 · 必须严格遵守】为「${exam.name}」(艺术/表演/技能类考试)出 ${genCount} 道 qtype="perform" 的表演任务题(考生录音/录像作答),一道选择/判断/填空/简答/文字题都不要出。
围绕这门专业真实考核的表演内容出题。当前参考知识点是「${kp.title}」——如果它其实是考务/规则/防作弊/报名之类的事务性内容(不是表演本身),请【忽略它】,改为围绕这门专业最核心的表演科目出题(例如:命题表演/情景表演、台词/朗诵、声乐/演唱、形体/舞蹈、即兴、才艺展示等)。${otherNote ? "\n考生要求(最高优先级):" + otherNote : ""}
${performBlock}
考试档案摘要:${dossier.slice(0, 1500)}${qaAnswers ? "\n考生背景:" + qaAnswers : ""}
每题必须填全 perform 字段;stem 写命题(例如"命题即兴表演:雨夜等人"、"朗诵一段自备台词并做人物塑造"、"跟随所给音乐即兴舞蹈")。` + langRule;
      } else {
        genSchemaUse = genSchema;
        genPrompt = (otherNote ? `【考生补充要求 · 优先遵守】${otherNote}\n` : "") + `为「${exam.name}」出 ${genCount} 道练习题,考察「${kp.title}」(章节:${chapter})。题型按这门考试的性质来定。
${hits.length ? "必须依据以下资料:\n" + ragBlock(hits) : "无资料支撑,只出保守的基本概念题,不要编造具体数字或条款。"}
考试档案摘要:${dossier.slice(0, 1500)}${qaAnswers ? "\n考生背景:" + qaAnswers : ""}${overallSnip ? "\n考生整体画像(跨所有考试):" + overallSnip : ""}
single/multi给4选项、answer写字母;judge写"对"/"错"(中文);fill写标准答案;short写评分要点;explanation解释;difficulty 1~3。
数学公式用 $...$ 包裹,不要裸露反斜杠命令。
严禁答题技巧/应试策略题、考试规则事务题(这些归考前准备)。${mparts.length ? "\n【多模态】本考试有图片/音频原件(见附件),鼓励据此出听力/看图题:题干注明「请听/看附件」,答案依据附件;同一音频可出多套。" : ""}${performBlock}
【防泄题】组内不得答案泄露、不要高度相似。${lessons ? "\n【避免已知毛病】\n" + lessons : ""}` + (mparts.length ? "\n考生资料库中的图片/音频原件已作为附件提供,可据此出题。" : "") + langRule;
      }
      const genPromise = generateJson(genPrompt, genSchemaUse, mparts.length ? { contents: [{ role: "user", parts: [{ text: genPrompt }, ...mparts] }] } : {}).catch(() => ({ questions: [] }));
      const onlinePromise = perfOn ? Promise.resolve({ found: [], note: "" }) : searchOnline(exam, kp, chapter, need, user.lang).catch(() => ({ found: [], note: "" }));
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
          const cap = p.captureType === "video" ? "video" : "audio"; const aa = p.analyzeAudio || (cap === "video" && p.mediaMaterialId ? "music" : "recorded");
          let mediaMaterialId = p.mediaMaterialId || null; let autoMusic = false;
          if (!mediaMaterialId && (aa === "music" || aa === "both")) { const _mid = await findAndStoreMusic(exam.id, `${kp.title} ${q.stem}`); if (!_mid) throw new AiError("music", "given-music perform task: music source failed"); mediaMaterialId = _mid; autoMusic = true; }
          let pStem = q.stem, pInstr = p.instructions || "";
          if (autoMusic) {
            const st = db.prepare("SELECT ai_style FROM materials WHERE id=?").get(mediaMaterialId)?.ai_style || "";
            const aligned = await alignStemToMusic(pStem, pInstr, st);
            if (aligned) { pStem = aligned.stem; pInstr = aligned.instructions || pInstr; }
            pInstr = pInstr + (st ? ` (所给音乐实际风格:${st})` : "") + " 【说明】这类题练的就是「现场给定音乐即兴发挥」:所给音乐由系统随机附上、你事先并不知道风格,正是要练的临场反应;重点是快速抓住它的节奏与情绪并即兴贴合,不必在意具体是哪首曲子。";
          }
          const body = JSON.stringify({ stem: pStem, captureType: cap, mediaMaterialId, analyzeAudio: aa, countdownSec: p.countdownSec || 3, autoStopAfterMediaSec: p.autoStopAfterMediaSec || 7, maxDurationSec: 300, rubric: p.rubric || [], instructions: pInstr });
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
