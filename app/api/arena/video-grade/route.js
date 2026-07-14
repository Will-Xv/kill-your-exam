import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { inScope } from "@/lib/db";
import { generate, langInstruction, uploadMedia } from "@/lib/gemini";
import { getMode, recordResult } from "@/lib/customModes";
import { leafKpList, recordCrossKp } from "@/lib/mastery";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

// 视频类自定义考核:上传视频 → File API 上传给 Gemini → 多模态按作者写的规则/评分点判分 → 记成绩。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    let form; try { form = await req.formData(); } catch { return Response.json({ error: "upload_parse_failed" }, { status: 413 }); }
    const modeId = Number(form.get("modeId"));
    const file = form.get("video");
    const mode = getMode(modeId);
    if (!mode || !exam || !inScope(exam.id, mode.exam_id)) return forbidden();
    if (!file || typeof file === "string") return Response.json({ error: "no_video" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "video/mp4";
    const ext = /webm/i.test(mime) ? "webm" : /quicktime|mov/i.test(mime) ? "mov" : "mp4";
    const up = await uploadMedia(buf, mime, ext);
    const kpList = leafKpList(exam.id);
    const kpListStr = kpList.slice(0, 120).map((k) => `[${k.id}] ${k.chapter ? k.chapter + "/" : ""}${k.title}`).join("\n");
    const prompt = `你是这门「${exam.name}」的考官,正在评一场【视频类考核】:「${mode.name}」。
考核规则/要求(作者原话):${mode.spec || "(未写详细规则)"}
${mode.win_desc ? "满分/达成条件:" + mode.win_desc : ""}
请观看考生提交的视频,严格但公正地按上述要求评分:给 0~100 分(score),并给出反馈(feedback):做到了什么、哪里不足、怎么改进。以事实与要求为准,不因表面流畅就给高分。
另外,如果视频里【清楚体现】出考生对某些知识点的正确理解或明显误区,在 kpSignals 里列出:正确应用/理解->kind=understanding;明显用错/概念错误->kind=misconception;看不出就别填。kpId 只能取自下面清单,要确凿才填。知识点清单:\n${kpListStr}` + langInstruction(user.lang);
    const res = await generate(null, { contents: [{ role: "user", parts: [{ text: prompt }, { fileData: { fileUri: up.fileUri, mimeType: up.mimeType } }] }], jsonSchema: { type: "object", properties: { score: { type: "integer" }, feedback: { type: "string" }, kpSignals: { type: "array", items: { type: "object", properties: { kpId: { type: "integer" }, kind: { type: "string", enum: ["understanding", "misconception"] } }, required: ["kpId", "kind"] } } }, required: ["score", "feedback"] } });
    let g; try { g = JSON.parse(res.text); } catch { g = { score: 0, feedback: "评分解析失败,请重试" }; }
    const score = Math.max(0, Math.min(100, g.score || 0));
    try { recordResult(user, mode, { meter: score, win: score >= 80 }); } catch {}
    if (Array.isArray(g.kpSignals) && g.kpSignals.length) { try { recordCrossKp(exam.id, null, g.kpSignals.map((x) => ({ kpId: x.kpId, kind: x.kind, insight: `视频考核「${mode.name}」中体现` })), null); } catch {} }
    return Response.json({ ok: true, score, feedback: g.feedback || "", win: score >= 80 });
  } catch (e) { return aiErrorResponse(e); }
}
