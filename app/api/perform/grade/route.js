import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generate, langInstruction, uploadMedia, deleteMedia } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";
import { saveRec, readMat, saveBugDevRec } from "@/lib/files";
import { hasFfmpeg, detectBeats } from "@/lib/media";

export const maxDuration = 300;
const B64 = (b) => b.toString("base64");
const CONTACT = "处理失败了,请稍后再试;如果一直不行,请点右下角「意见反馈」联系 Will。";

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const form = await req.formData();
  const questionId = Number(form.get("questionId"));
  const devBugId = Number(form.get("devBugId")) || 0; // 开发者在 Bug 里「亲自试做」:判分并把作答存到该 bug,不写入用户练习记录
  const bodyJson = form.get("bodyJson"); const answerJson = form.get("answerJson");
  const file = form.get("recording");
  let q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
  if (devBugId) {
    if (!user.is_developer) return forbidden();
    if (bodyJson) q = { ...(q || { id: questionId, kp_id: null, exam_id: null }), body: bodyJson, answer: answerJson || (q && q.answer) || "{}" };
    if (!q) return forbidden();
  } else {
    if (!q || !exam || q.exam_id !== exam.id) return forbidden();
  }
  if (!file) return Response.json({ error: "没有录制文件" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length) return Response.json({ error: "录制为空" }, { status: 400 });
  if (buffer.length > 500 * 1024 * 1024) return Response.json({ error: "录制文件过大(超过 500MB)" }, { status: 400 });

  const body = JSON.parse(q.body || "{}");
  const ans = JSON.parse(q.answer || "{}");
  const rubric = (ans.rubric && ans.rubric.length ? ans.rubric : body.rubric) || [];
  const isVideo = body.captureType === "video";
  const recMime = file.type || (isVideo ? "video/webm" : "audio/webm");
  const analyzeAudio = body.analyzeAudio || (isVideo && body.mediaMaterialId ? "music" : "recorded");

  const uploaded = []; // File API 文件名,用完删
  try {
    const parts = [];
    // 录像:走 File API(无 20MB 限制),并请求 5fps 采样
    if (isVideo) {
      const up = await uploadMedia(buffer, recMime, "webm");
      uploaded.push(up.name);
      parts.push({ fileData: { fileUri: up.fileUri, mimeType: up.mimeType }, videoMetadata: { fps: 5 } });
    } else {
      // 录音:小则内联,大则 File API
      if (buffer.length <= 18 * 1024 * 1024) parts.push({ inlineData: { mimeType: recMime, data: B64(buffer) } });
      else { const up = await uploadMedia(buffer, recMime, "webm"); uploaded.push(up.name); parts.push({ fileData: { fileUri: up.fileUri, mimeType: up.mimeType } }); }
    }
    // 干净原曲 + 节拍(舞蹈类对齐用)
    let beatInfo = "";
    if (body.mediaMaterialId && (analyzeAudio === "music" || analyzeAudio === "both")) {
      const m = db.prepare("SELECT mime FROM materials WHERE id=?").get(body.mediaMaterialId);
      const mbuf = readMat(body.mediaMaterialId);
      if (mbuf) {
        if (hasFfmpeg()) { const bt = detectBeats(mbuf); if (bt) beatInfo = `所给音乐估算 BPM≈${bt.bpm ?? "?"};重拍大约在(秒):${bt.beats.join(", ")}。`; }
        if (mbuf.length <= 15 * 1024 * 1024) parts.push({ inlineData: { mimeType: m?.mime || "audio/mpeg", data: B64(mbuf) } });
        else { const up = await uploadMedia(mbuf, m?.mime || "audio/mpeg", "mp3"); uploaded.push(up.name); parts.push({ fileData: { fileUri: up.fileUri, mimeType: up.mimeType } }); }
      }
    }

    const howAnalyzed = isVideo
      ? ("你的整段录像(按每秒 5 帧采样、自带时间戳)" + (analyzeAudio === "music" ? " + 所给音乐原曲(干净)" : analyzeAudio === "both" ? " + 所给音乐原曲 + 录像里的声音" : "(含录像里的声音)"))
      : "你的录音";
    const gradePrompt = `你是这门表演/技能类考试的评委。\n命题:${body.stem}\n评分维度:${rubric.join("、") || "综合表现"}\n${ans.notes ? "评分/示范要点:" + ans.notes + "\n" : ""}` +
      `【材料】${howAnalyzed}。${isVideo ? "视频按时间顺序、每秒 5 帧;音乐与录制同一时刻(0 秒)开始,请据此判断动作是否踩上音乐/节拍。" : ""}${beatInfo ? "（" + beatInfo + "）" : ""}\n` +
      `【评分要求 · 从严、诚实,别一味鼓励】\n` +
      `- 先核对是否达到命题要求:时长够不够、是不是真的在按命题表演、规定内容有没有完成。时长严重不足(如只做了十几秒)、敷衍乱做、胡乱抡动、跑题、全程无有效动作或内容,一律算"未完成",综合分只能给 0~35。\n` +
      `- 要分清【笑场】和【符合情境的微笑/表情】:笑场=出戏、控制不住地笑、和角色/情境不符、把表演演崩了 —— 这是大忌,必须指出并扣分;但如果是贴合情境、有意为之、有感染力的微笑或笑容(是面部表演的一部分),那属于【表现力,应当肯定甚至加分】,别误判成笑场。看镜头发呆、明显糊弄仍要扣分。\n` +
      `- 评分刻度:90~100 接近专业;75~89 良好、瑕不掩瑜;60~74 基本合格但明显不足;40~59 较差、问题很多;0~39 未完成/敷衍/跑题/严重失误。宁可打低,不要为了让考生高兴而虚高。\n` +
      `- 点评要客观:有优点才说优点,没有就直说问题,不要硬找亮点、不要空洞夸奖${isVideo ? "(可结合时间点,如“0:03 就停下笑场”)" : ""}。\n` +
      `请:1) 按每个评分维度逐条如实点评;2) 给 0~100 综合分(严格按上面的刻度和扣分规则);3) 给 2~3 条具体可练的改进建议。开头一句提醒:这是 AI 辅助点评,仅供练习参考,不代表专业评委的权威评分。` + langInstruction(user.lang);

    const schema = { type: "object", properties: { score: { type: "integer" }, feedback: { type: "string" } }, required: ["score", "feedback"] };
    const res = await generate(null, { contents: [{ role: "user", parts: [{ text: gradePrompt }, ...parts] }], jsonSchema: schema });
    const g = JSON.parse(res.text);
    const score = Math.max(0, Math.min(100, g.score || 0));
    if (devBugId) {
      try { saveBugDevRec(devBugId, buffer); } catch {}
      try { db.prepare("UPDATE bug_reports SET dev_answer_mime=?, dev_answer_score=?, dev_answer_feedback=? WHERE id=?").run(recMime, score, g.feedback, devBugId); } catch {}
      return Response.json({ score, feedback: g.feedback, saved: true });
    }
    const musicMat = (analyzeAudio === "music" && body.mediaMaterialId) ? body.mediaMaterialId : null; // 无麦克风的给定音乐题:回放时叠加这首原配乐
    const info = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode,q_stem,music_material_id) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(questionId, exam.id, q.kp_id, "[表演录制]", score >= 60 ? 1 : 0, score, g.feedback, "practice", body.stem || null, musicMat);
    try { saveRec(info.lastInsertRowid, buffer); } catch {}
    return Response.json({ score, feedback: g.feedback, attemptId: info.lastInsertRowid });
  } catch (e) {
    if (e?.isAiError) return aiErrorResponse(e);
    return Response.json({ error: CONTACT }, { status: 500 });
  } finally {
    for (const n of uploaded) { try { await deleteMedia(n); } catch {} }
  }
}
