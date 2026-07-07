import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { saveBugAtt } from "@/lib/files";
import { sendLetter } from "@/lib/inbox";
import { notifyUser } from "@/lib/notify";
import { aiErrorResponse } from "@/lib/errors";

// 用户点「反馈bug」(题目设计/功能问题,如无法录音、题目与选项乱套)。
// 把这道题的完整信息 + 用户的草稿/手写/上传/作答/AI判分/追问全部打包给管理员和开发者。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { questionId, userNote, context } = await req.json();
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
    if (!q || !exam || q.exam_id !== exam.id) return forbidden();
    const body = JSON.parse(q.body); let ans = {}; try { ans = JSON.parse(q.answer); } catch {}
    const c = context || {};

    // 图片/文件类附件另存磁盘(草稿、手写、上传)
    const atts = [];
    const pushImg = (dataurl, name) => { if (!dataurl) return; const b64 = String(dataurl).split(",")[1]; if (b64) atts.push({ name, mime: "image/png", data: b64 }); };
    pushImg(c.draftImage, "draft.png");
    pushImg(c.handImage, "handwriting.png");
    if (Array.isArray(c.uploads)) for (const u of c.uploads.slice(0, 4)) if (u?.data) atts.push({ name: u.name || "upload", mime: u.mime || "application/octet-stream", data: u.data });

    const snapshot = {
      qtype: q.qtype, stem: body.stem || "", options: body.options || [],
      answer: ans.answer || "", explanation: ans.explanation || "",
      perform: q.qtype === "perform" ? { captureType: body.captureType, mediaMaterialId: body.mediaMaterialId, analyzeAudio: body.analyzeAudio, rubric: body.rubric || [], instructions: body.instructions || "" } : null,
      audioId: body.audioId || null, listenScript: body.listenScript || null,
      userAnswer: c.userAnswer != null ? String(c.userAnswer) : "",
      selected: c.selected || null,
      grade: c.grade || null,               // { correct, score, feedback }
      discuss: Array.isArray(c.discuss) ? c.discuss : [],
      attMeta: atts.map((a) => ({ name: a.name, mime: a.mime })),
      examName: exam.name,
    };

    const ins = db.prepare("INSERT INTO bug_reports(exam_id,user_id,username,question_id,qtype,snapshot,user_note,status) VALUES(?,?,?,?,?,?,?, 'open')")
      .run(exam.id, user.id, user.username, questionId, q.qtype, JSON.stringify(snapshot), (userNote || "").slice(0, 2000));
    if (atts.length) { try { saveBugAtt(ins.lastInsertRowid, atts); } catch {} }

    // 通知所有管理员/开发者:有新 bug(进收件箱 + 按各自设置发消息提醒)
    try {
      const staff = db.prepare("SELECT id FROM users WHERE (is_admin=1 OR is_developer=1) AND deleted_at IS NULL AND id != ?").all(user.id);
      const stem = (snapshot.stem || "").slice(0, 60);
      const title = "🐞 新 Bug 反馈";
      const body = `来自 ${user.username} · ${exam.name}\n题目(${q.qtype}):${stem}${(snapshot.stem || "").length > 60 ? "…" : ""}${(userNote || "").trim() ? "\n用户说:" + userNote.trim().slice(0, 200) : ""}\n\n到导航「🐞 Bug 反馈」查看完整信息(题目/作答/草稿/追问)并处理。`;
      for (const su of staff) {
        try { sendLetter(su.id, { title, body, key: `newbug-${ins.lastInsertRowid}-${su.id}` }); } catch {}
        notifyUser(su.id, "bugfeedback", { title, body: `${user.username}: ${stem}`, url: "/bugs" }).catch(() => {});
      }
    } catch {}

    return Response.json({ ok: true, id: ins.lastInsertRowid });
  } catch (e) { return aiErrorResponse(e); }
}
