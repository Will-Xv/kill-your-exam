import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generate, langInstruction, uploadMedia, deleteMedia } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";
import { saveRec, readMat, saveBugDevRec } from "@/lib/files";
import { hasFfmpeg, detectBeats, extractFrames, extractAudio, transcodeToMp3, transcodeToMp4, probeDurationSec } from "@/lib/media";
import fs from "fs";
import os from "os";
import path from "path";

export const maxDuration = 300;
const B64 = (b) => b.toString("base64");
const CONTACT = "处理失败了,请稍后再试;如果一直不行,请点右下角「意见反馈」联系 Will。";

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  let form;
  try { form = await req.formData(); }
  catch (e) { return Response.json({ error: "上传解析失败(可能文件过大或网络中断),请重试或缩短时长后重录。", detail: String(e?.message || e).slice(0, 200) }, { status: 413 }); }
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

  const uploaded = []; // File API 文件名,用完删(仅在过大兜底时用)
  let tmp = null;
  try {
    const BUDGET = 18 * 1024 * 1024;
    const parts = [];
    let used = 0;
    const pushInline = (mimeType, buf) => { if (!buf || used + buf.length > BUDGET) return false; parts.push({ inlineData: { mimeType, data: B64(buf) } }); used += buf.length; return true; };

    // ---- 录像 ----
    // 短视频:自己抽 5fps/720p 帧(JPEG + 时间戳)+ 音轨内联发给 Gemini(精确可控)。
    // 长视频:内联放不下(单次请求约 20MB 上限),改成转 mp4(保 720p、高画质)走 File API,
    //          让 Gemini【自己按 5fps 采样】——语义等价于"每秒 5 帧 + 音轨",但没有大小/长度限制。
    // 短视频(≤40s):自己抽 5fps/720p 帧 + 音轨内联(真 5fps、快)。
    // 长视频:转 mp4(保 720p)走 File API,让 Gemini【自己按 5fps 采样】——长度不限、满 5fps(内联塞不下这么多帧)。
    let framesSent = 0, usedFileApi = false;
    if (isVideo && hasFfmpeg()) {
      tmp = path.join(os.tmpdir(), `rec-${Date.now()}-${Math.random().toString(36).slice(2)}.webm`);
      fs.writeFileSync(tmp, buffer);
      const dur = probeDurationSec(buffer) || 0;
      const isShort = dur > 0 && dur <= 40; // ≤40s @5fps 内联可控
      if (isShort) {
        const frames = extractFrames(tmp, { fps: 5, height: 720, maxFrames: 210, q: 12 });
        const recAudio = (analyzeAudio === "recorded" || analyzeAudio === "both") ? extractAudio(tmp) : null;
        for (const fr of frames) {
          if (used + fr.jpeg.length > 12 * 1024 * 1024) break; // ~12MB 帧(base64 后 ~16MB),留余量
          parts.push({ text: `【${fr.t}s】` });
          parts.push({ inlineData: { mimeType: "image/jpeg", data: B64(fr.jpeg) } });
          used += fr.jpeg.length; framesSent++;
        }
        if (recAudio) pushInline("audio/mp4", recAudio);
      }
      if (framesSent === 0) {
        // 长视频 / 时长未知 → 转 mp4 走 File API(Gemini 按满 5fps 采样,全长不限)
        parts.length = 0; used = 0;
        const mp4 = transcodeToMp4(buffer);
        if (mp4 && mp4.length) { const up = await uploadMedia(mp4, "video/mp4", "mp4"); uploaded.push(up.name); parts.push({ fileData: { fileUri: up.fileUri, mimeType: up.mimeType }, videoMetadata: { fps: 5 } }); usedFileApi = true; }
      }
    }

    // ---- 给定音乐原曲(干净)+ 节拍(舞蹈类对齐用)----
    let beatInfo = "";
    if (body.mediaMaterialId && (analyzeAudio === "music" || analyzeAudio === "both")) {
      const m = db.prepare("SELECT mime FROM materials WHERE id=?").get(body.mediaMaterialId);
      const mbuf = readMat(body.mediaMaterialId);
      if (mbuf) {
        if (hasFfmpeg()) { const bt = detectBeats(mbuf); if (bt) beatInfo = `所给音乐估算 BPM≈${bt.bpm ?? "?"};重拍大约在(秒):${bt.beats.join(", ")}。`; }
        if (!pushInline(m?.mime || "audio/mpeg", mbuf) && mbuf.length > BUDGET) { const up = await uploadMedia(mbuf, m?.mime || "audio/mpeg", "mp3"); uploaded.push(up.name); parts.push({ fileData: { fileUri: up.fileUri, mimeType: up.mimeType } }); }
      }
    }

    // ---- 纯录音题的人声:webm 不被内联接受,转 mp3 再送(视频的人声已在上面随帧/mp4 处理)----
    if (!isVideo && (analyzeAudio === "recorded" || analyzeAudio === "both")) {
      let ab = buffer, am = recMime;
      const supported = /(wav|mpeg|mp3|aac|flac|ogg)/i.test(recMime);
      if (!supported && hasFfmpeg()) { const mp3 = transcodeToMp3(buffer); if (mp3 && mp3.length) { ab = mp3; am = "audio/mp3"; } }
      else if (supported) am = recMime.split(";")[0];
      if (!pushInline(am, ab) && ab.length > BUDGET) { const up = await uploadMedia(ab, am, am.includes("mp3") ? "mp3" : "webm"); uploaded.push(up.name); parts.push({ fileData: { fileUri: up.fileUri, mimeType: up.mimeType } }); }
    }

    // 兜底:既没内联到帧、也没走 File API(极少数:无 ffmpeg / 转码失败)
    if (isVideo && framesSent === 0 && !usedFileApi && !parts.some((p) => p.fileData || p.inlineData)) {
      return Response.json({ error: "服务器暂时无法处理这段录像,请稍后重试或缩短时长后重录。" }, { status: 400 });
    }

    const howAnalyzed = isVideo
      ? (framesSent ? `按每秒 5 帧、720P 截取的 ${framesSent} 张画面(每张前标了时间戳)` : "整段录像(保留 720P,由 AI 按每秒 5 帧采样、全长分析)") + (analyzeAudio === "music" ? " + 所给音乐原曲" : analyzeAudio === "both" ? " + 所给音乐原曲 + 录进去的声音" : " + 录进去的声音")
      : "你的录音";
    const gradePrompt = `你是这门表演/技能类考试的评委。\n命题:${body.stem}\n评分维度:${rubric.join("、") || "综合表现"}\n${ans.notes ? "评分/示范要点:" + ans.notes + "\n" : ""}` +
      `【材料】${howAnalyzed}。${isVideo && framesSent ? "画面帧按时间先后排列、每张前标了【x秒】时间戳;" : ""}${isVideo ? "音乐与录制从同一时刻(0 秒)开始,请据此判断动作是否踩上音乐/节拍。" : ""}${beatInfo ? "（" + beatInfo + "）" : ""}\n` +
      `【评分要求 · 从严、诚实,别一味鼓励】\n` +
      `- 先核对是否达到命题要求:时长够不够、是不是真的在按命题表演、规定内容有没有完成。时长严重不足(如只做了十几秒)、敷衍乱做、胡乱抡动、跑题、全程无有效动作或内容,一律算"未完成",综合分只能给 0~35。\n` +
      `- 要分清【笑场】和【符合情境的微笑/表情】:笑场=出戏、控制不住地笑、和角色/情境不符、把表演演崩了 —— 这是大忌,必须指出并扣分;但如果是贴合情境、有意为之、有感染力的微笑或笑容(是面部表演的一部分),那属于【表现力,应当肯定甚至加分】,别误判成笑场。看镜头发呆、明显糊弄仍要扣分。\n` +
      `- 评分刻度:90~100 接近专业;75~89 良好、瑕不掩瑜;60~74 基本合格但明显不足;40~59 较差、问题很多;0~39 未完成/敷衍/跑题/严重失误。宁可打低,不要为了让考生高兴而虚高。\n` +
      `- 点评要客观:有优点才说优点,没有就直说问题,不要硬找亮点、不要空洞夸奖${isVideo ? "(可结合时间点,如“0:03 就停下笑场”)" : ""}。\n` +
      `请:1) 按每个评分维度逐条如实点评;2) 给 0~100 综合分(严格按上面的刻度和扣分规则);3) 给 2~3 条具体可练的改进建议。开头一句提醒:这是 AI 辅助点评,仅供练习参考,不代表专业评委的权威评分。` + langInstruction(user.lang);

    const schema = { type: "object", properties: { score: { type: "integer" }, feedback: { type: "string" } }, required: ["score", "feedback"] };
    const res = await generate(null, { contents: [{ role: "user", parts: [{ text: gradePrompt }, ...parts] }], jsonSchema: schema });
    if (!res.text || !res.text.trim()) { const fr = res.candidates?.[0]?.finishReason || "empty"; throw new Error("模型没有返回评分内容(" + fr + "),可能是录制内容无法识别或被安全策略拦截,请重录后再试"); }
    let g; try { g = JSON.parse(res.text); } catch { const m = String(res.text).match(/\{[\s\S]*\}/); if (m) { try { g = JSON.parse(m[0]); } catch {} } }
    if (!g || typeof g.score === "undefined") throw new Error("评分结果解析失败:" + String(res.text).slice(0, 160));
    const score = Math.max(0, Math.min(100, g.score || 0));
    const fb = String(g.feedback || "").replace(/\\r\\n|\\r|\\n/g, "\n"); // 模型偶尔输出字面 \n,转成真换行
    if (devBugId) {
      try { saveBugDevRec(devBugId, buffer); } catch {}
      try { db.prepare("UPDATE bug_reports SET dev_answer_mime=?, dev_answer_score=?, dev_answer_feedback=? WHERE id=?").run(recMime, score, fb, devBugId); } catch {}
      return Response.json({ score, feedback: fb, saved: true });
    }
    const musicMat = (analyzeAudio === "music" && body.mediaMaterialId) ? body.mediaMaterialId : null; // 无麦克风的给定音乐题:回放时叠加这首原配乐
    const info = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode,q_stem,music_material_id) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(questionId, exam.id, q.kp_id, "[表演录制]", score >= 60 ? 1 : 0, score, fb, "practice", body.stem || null, musicMat);
    try { saveRec(info.lastInsertRowid, buffer); } catch {}
    return Response.json({ score, feedback: fb, attemptId: info.lastInsertRowid });
  } catch (e) {
    if (e?.isAiError) return aiErrorResponse(e);
    console.error("[perform/grade] error:", e?.message || e, e?.stack || "");
    return Response.json({ error: CONTACT, detail: String(e?.message || e).slice(0, 400) }, { status: 500 });
  } finally {
    try { if (tmp) fs.rmSync(tmp, { force: true }); } catch {}
    for (const n of uploaded) { try { await deleteMedia(n); } catch {} }
  }
}
