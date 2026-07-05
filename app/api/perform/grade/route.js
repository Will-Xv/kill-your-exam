import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generate, langInstruction } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";
import { saveRec, readMat } from "@/lib/files";
import { hasFfmpeg, extractFrames, extractAudio, detectBeats } from "@/lib/media";
import fs from "fs";
import os from "os";
import path from "path";

export const maxDuration = 300;
const B64 = (buf) => buf.toString("base64");

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const form = await req.formData();
  const questionId = Number(form.get("questionId"));
  const file = form.get("recording");
  const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
  if (!q || !exam || q.exam_id !== exam.id) return forbidden();
  if (!file) return Response.json({ error: "没有录制文件" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length) return Response.json({ error: "录制为空" }, { status: 400 });
  if (buffer.length > 200 * 1024 * 1024) return Response.json({ error: "录制文件过大" }, { status: 400 });

  const body = JSON.parse(q.body || "{}");
  const ans = JSON.parse(q.answer || "{}");
  const rubric = (ans.rubric && ans.rubric.length ? ans.rubric : body.rubric) || [];
  const isVideo = body.captureType === "video";
  const recMime = file.type || (isVideo ? "video/webm" : "audio/webm");
  const analyzeAudio = body.analyzeAudio || (isVideo && body.mediaMaterialId ? "music" : "recorded");

  const BUDGET = 18 * 1024 * 1024;
  const parts = []; // text/inline parts after the main prompt
  let used = 0;
  const pushInline = (mimeType, buf) => { if (used + buf.length > BUDGET) return false; parts.push({ inlineData: { mimeType, data: B64(buf) } }); used += buf.length; return true; };

  let howAnalyzed = "";
  let beatInfo = "";
  let tmp = null;
  try {
    // ---- 视频:抽 5fps / 720p 帧 + 时间戳 ----
    let framesSent = 0;
    if (isVideo && hasFfmpeg()) {
      tmp = path.join(os.tmpdir(), `rec-${Date.now()}.webm`);
      fs.writeFileSync(tmp, buffer);
      const frames = extractFrames(tmp, { fps: 5, height: 720, maxFrames: 150 });
      for (const fr of frames) {
        if (used + fr.jpeg.length > BUDGET - 4 * 1024 * 1024) break; // 给音频留 4MB
        parts.push({ text: `【${fr.t}s】` });
        parts.push({ inlineData: { mimeType: "image/jpeg", data: B64(fr.jpeg) } });
        used += fr.jpeg.length; framesSent++;
      }
    }
    // ---- 原曲(干净)+ 节拍 ----
    if (body.mediaMaterialId && (analyzeAudio === "music" || analyzeAudio === "both")) {
      const m = db.prepare("SELECT mime FROM materials WHERE id=?").get(body.mediaMaterialId);
      const mbuf = readMat(body.mediaMaterialId);
      if (mbuf) {
        const bt = detectBeats(mbuf);
        if (bt) beatInfo = `所给音乐估算 BPM≈${bt.bpm ?? "?"};重拍大约在(秒):${bt.beats.join(", ")}。`;
        pushInline(m?.mime || "audio/mpeg", mbuf);
      }
    }
    // ---- 录进去的人声 ----
    if (analyzeAudio === "recorded" || analyzeAudio === "both") {
      if (isVideo && hasFfmpeg() && tmp) { const a = extractAudio(tmp); if (a) pushInline("audio/mp4", a); }
      else if (!isVideo) pushInline(recMime, buffer); // 录音本身就是人声
    }

    // 若视频没抽到帧(无 ffmpeg 或失败)→ 回退:整段录像直接发(≤18MB 才发)
    if (isVideo && framesSent === 0) {
      if (buffer.length <= BUDGET) { parts.length = 0; used = 0; parts.push({ inlineData: { mimeType: recMime, data: B64(buffer) } }); howAnalyzed = "整段录像"; }
      else return Response.json({ error: "录像太大且服务器暂时无法抽帧,请缩短时长或降清晰度后重录。" }, { status: 400 });
    } else if (isVideo) {
      howAnalyzed = `按每秒 5 帧、720P 截取的 ${framesSent} 张画面(每张标了时间戳)` + (analyzeAudio === "music" ? " + 所给音乐原曲" : analyzeAudio === "both" ? " + 所给音乐原曲 + 你录进去的声音" : " + 你录进去的声音");
    } else {
      howAnalyzed = "你的录音";
    }

    const gradePrompt = `你是这门表演/技能类考试的评委。\n命题:${body.stem}\n评分维度:${rubric.join("、") || "综合表现"}\n${ans.notes ? "评分/示范要点:" + ans.notes + "\n" : ""}` +
      `【本次提供给你的材料】${howAnalyzed}。${isVideo && framesSent ? "画面帧按时间先后排列、每张前标了【x秒】时间戳;音乐与录制从同一时刻(0 秒)开始,请据此判断动作是否踩上音乐/节拍。" : ""}${beatInfo ? "（" + beatInfo + "）" : ""}\n` +
      `请:1) 按每个评分维度逐条点评(先亮点后可改进${isVideo && framesSent ? ",并结合关键时间点,如“在 3.2s 的重拍上动作略慢”" : ""});2) 给 0~100 综合分;3) 给 2~3 条具体可练的改进建议。开头一句提醒:这是 AI 辅助点评,仅供练习参考,不代表专业评委的权威评分。` + langInstruction(user.lang);

    const schema = { type: "object", properties: { score: { type: "integer" }, feedback: { type: "string" } }, required: ["score", "feedback"] };
    const res = await generate(null, { contents: [{ role: "user", parts: [{ text: gradePrompt }, ...parts] }], jsonSchema: schema });
    const g = JSON.parse(res.text);
    const score = Math.max(0, Math.min(100, g.score || 0));
    const info = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode) VALUES(?,?,?,?,?,?,?,?)")
      .run(questionId, exam.id, q.kp_id, "[表演录制]", score >= 60 ? 1 : 0, score, g.feedback, "practice");
    try { saveRec(info.lastInsertRowid, buffer); } catch {}
    return Response.json({ score, feedback: g.feedback, attemptId: info.lastInsertRowid });
  } catch (e) { return aiErrorResponse(e); }
  finally { try { if (tmp) fs.rmSync(tmp, { force: true }); } catch {} }
}
