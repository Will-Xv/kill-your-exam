import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { generateJson, langInstruction, attachParts, embed, cosine } from "@/lib/gemini";
import { leafKpList } from "@/lib/mastery";
import { aiErrorResponse } from "@/lib/errors";
import { buildFigures, dropFigures } from "@/lib/figures";
import { matPath, saveMat, ensureMatDir } from "@/lib/files";

export const maxDuration = 300;

// 上传文件做题:多模态识别文件里的每道题(题干/选项/答案),文件没给答案的让 AI 解出正确答案(为了能判分),
// 每道题语义就近绑到当前考试的一个知识点,入 questions 表。留住上传文件(File API parts)进 quiz_sessions,便于"重新识别"。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });
    const { attachments, text, reRecognize } = await req.json();

    let parts = [];
    let sess = null;
    if (reRecognize) {
      // 重新识别:复用上次那份上传文件(File API parts,约48h内有效)
      sess = db.prepare("SELECT * FROM quiz_sessions WHERE id=? AND user_id=?").get(Number(reRecognize), user.id);
      if (!sess) return Response.json({ error: "session_not_found" }, { status: 404 });
      try { parts = JSON.parse(sess.parts_json || "[]"); } catch { parts = []; }
      if (!parts.length) return Response.json({ error: "file_expired" }, { status: 410 });
    } else {
      try { parts = await attachParts(Array.isArray(attachments) ? attachments.slice(0, 6) : []); } catch {}
      if (!parts.length && !String(text || "").trim()) return Response.json({ error: "empty" }, { status: 400 });
    }

    const schema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
      qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] },
      stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
      answer: { type: "string" }, explanation: { type: "string" }, answerFromFile: { type: "boolean" },
      figures: { type: "array", description: "这道题【自带的图】(几何图形、电路、图表、地图、照片…)。纯文字题留空数组。",
        items: { type: "object", properties: {
          file: { type: "integer", description: "图在【第几个附件】里(从 0 数;只传了一个文件就填 0)" },
          page: { type: "integer", description: "图在第几页(PDF 从 1 数;单张图片填 0)" },
          bbox: { type: "array", description: "图的位置,四个 0~1 的小数 [左, 上, 右, 下],左上角是 0,0", items: { type: "number" } },
          alt: { type: "string", description: "一句话说明这张图画的是什么" }
        } } }
    }, required: ["qtype", "stem", "answer", "explanation"] } } }, required: ["questions"] };

    const prompt = `这是用户上传的一份【题目】文件/文本。请【识别出里面的每一道题】,一道不漏、也不要凭空增加。

★【一道大题下面有多个小问的,算【一道题】,绝对不要拆开】——这是最容易出错的地方。
  典型形态:「3. 设 f(x)=… (1) 求… (2) 求… (3) 证明…」,或「阅读下面材料,回答问题:①… ②…」。
  拆开会出大事:小问离开了大题主干(那个"设 f(x)=…"、那段材料、那张图表)就【看不懂、也没法作答】,
  用户会看到一道没有题干的孤零零的"(2) 求极值"。
  正确做法:把【大题主干 + 全部小问】原样合并进【同一个 stem】,保留 (1)(2)(3) 的编号;
  ★各小问之间用【空行】隔开(写成 "…主干…\n\n(1) …\n\n(2) …"),因为 Markdown 里单个换行不会换行、
    小问会挤成一坨;用空行才能一问一行看得清。
  qtype 取能覆盖整题的那种(通常是 short);answer 里把各小问的答案【按同样的编号逐条列全】、
  同样用空行隔开(如「(1) …\n\n(2) …」),explanation 同理。宁可一道题长一点,也不能让小问失去题干。

对每道题:
- qtype: single(单选)/multi(多选)/judge(判断)/fill(填空)/short(简答),按题目实际形态判断。
- stem: 题干原文,尽量一字不差(可去掉题号)。【必须是正常文字、单词之间保留空格】。数学用行内 $...$ 只包【公式本身】、且用正确 LaTeX(\\sqrt{}、^、\\frac{}{});【绝对不要把整句话或普通单词包进 $...$】——否则整段会挤成一坨公式。示例:好=「Find the mass above the cone $z=\\sqrt{x^2+y^2}$」;坏=「$Find the mass above the cone z=sqrt(x^2+y^2)$」。
- options: 选择题的每个选项内容(不要带 "A." 前缀);判断/填空/简答留空数组。
- answer: 【这道题的正确答案】。文件给了答案就照抄;【文件没给答案,你要自己把题解出来给出正确答案】(单/多选写字母如 "A"/"AC";判断写"对"/"错";填空/简答写正确答案原文)。这是为了之后给用户判分,所以 answer 绝不能空。
- explanation: 简短解析,每道题都要有(原文有就照抄,没有就自己补;选择题要说明正确项为什么对、其他项错在哪)。
- answerFromFile: 答案是不是【文件里本来就给了】——文件里给了标准答案就 true;文件没给、是你自己解出来的就 false。
- figures: 【这道题带不带图】。几何图形、函数图像、电路图、地图、实验装置、照片……凡是【离了它这题就没法做】的图都要报;纯文字题留【空数组】,别把页眉/logo/装饰线报成图。
  PDF 填 page(第几页,从 1 数)+ bbox;单张图片 page 填 0、bbox 按整张图的比例填。bbox=[左, 上, 右, 下],都是 0~1 的比例,左上角是 0,0。
  框要把整张图连同坐标轴、标注、图题都框进去,宁可大一点也别切掉边角。alt 写一句话说明。
${text ? "文本内容:\n" + String(text).slice(0, 12000) : "题目在随附的文件里(图片/PDF),请多模态识读。"}` + langInstruction(user.lang);

    // 【题目插图·把附件也存一份】要把图从卷子里裁出来,就必须留住原文件字节。
    // 所以上传做题的附件除了发给模型,还另存成【隐藏资料】(auto=1,不进资料列表、不建索引),
    // 并把 id 记进 session —— 这样"重新识别"时(那时只剩 File API 引用、没有原始字节)照样能裁图。
    let figSrc = [];
    if (sess) {
      try { figSrc = JSON.parse(sess.fig_mids || "[]"); } catch { figSrc = []; }
      figSrc = figSrc.map((id) => { const m = db.prepare("SELECT id, kind FROM materials WHERE id=?").get(id); return m ? { materialId: m.id, kind: m.kind } : null; }).filter(Boolean);
    } else if (Array.isArray(attachments)) {
      for (const a of attachments.slice(0, 6)) {
        try {
          const mime = a.mime || "application/octet-stream";
          const kind = /pdf/i.test(mime) ? "pdf" : /^image\//i.test(mime) ? "image" : "other";
          if (kind === "other") { figSrc.push(null); continue; }
          const buf = Buffer.from(a.data || "", "base64");
          if (!buf.length || buf.length > 24 * 1024 * 1024) { figSrc.push(null); continue; }
          const ins = db.prepare("INSERT INTO materials(exam_id,filename,kind,status,mime,stored,auto,role) VALUES(?,?,?,?,?,1,1,'figure')")
            .run(exam.id, String(a.name || "quiz-src").slice(0, 120), kind, "ready", mime);
          ensureMatDir(); saveMat(ins.lastInsertRowid, buf);
          figSrc.push({ materialId: ins.lastInsertRowid, kind });
        } catch { figSrc.push(null); }
      }
    }

    // 【来源留痕】题库面板要能显示"这道题来自上传做题的哪份文件";重新识别时沿用上次记下的文件名。
    let srcName = "";
    try {
      srcName = sess ? String(sess.filenames || "") : (Array.isArray(attachments) ? attachments.map((a) => a && a.name).filter(Boolean).join("、") : "");
    } catch {}
    const srcRefs = JSON.stringify([{ via: "quiz-upload", filename: srcName.slice(0, 200) }]);

    const out = await generateJson(prompt, schema, { contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }] });
    const list = Array.isArray(out.questions) ? out.questions : [];

    // 重新识别:把上一版里【没作答过】的题清掉(去掉识别错的旧题,不动已作答的)
    if (sess) {
      try {
        const oldIds = JSON.parse(sess.question_ids_json || "[]");
        for (const oid of oldIds) {
          const hasAtt = db.prepare("SELECT 1 FROM attempts WHERE question_id=? LIMIT 1").get(oid);
          if (!hasAtt) {
            try { const old = db.prepare("SELECT body FROM questions WHERE id=?").get(oid); if (old) dropFigures(old.body); } catch {}
            try { db.prepare("DELETE FROM questions WHERE id=? AND exam_id=?").run(oid, exam.id); } catch {}
          }
        }
      } catch {}
    }

    if (!list.length) return Response.json({ ok: true, count: 0, questions: [], sessionId: sess ? sess.id : null });

    const kps = (() => { try { return leafKpList(exam.id); } catch { return []; } })();
    let kv = [];
    try { if (kps.length) kv = await embed(kps.map((k) => k.title)); } catch {}

    const created = [];
    for (const q of list) {
      const stem = String(q.stem || "").trim();
      if (!stem) continue;
      let kpId = null;
      if (kps.length && kv.length) {
        try { const [qv] = await embed([stem.slice(0, 200)]); let best = -1, bi = -1; kv.forEach((v, i) => { const sc = cosine(qv, v); if (sc > best) { best = sc; bi = i; } }); if (bi >= 0) kpId = kps[bi].id; } catch {}
      }
      const qtype = ["single", "multi", "judge", "fill", "short"].includes(q.qtype) ? q.qtype : "short";
      let figures = [];
      try { figures = await buildFigures(exam.id, figSrc, q.figures, "quiz"); } catch {}
      const body = JSON.stringify({ stem, options: Array.isArray(q.options) ? q.options : [], figures });
      const answer = JSON.stringify({ answer: String(q.answer || ""), explanation: String(q.explanation || "") });
      try {
        const ansOrigin = q.answerFromFile ? "provided" : "ai";   // provided=文件里给的, ai=AI解出的
        const info = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,is_real) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
          .run(exam.id, kpId, qtype, body, answer, 2, "material", srcRefs, "upload", ansOrigin, 1);
        const kpTitle = kpId ? (db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kpId)?.title || "") : "";
        created.push({ id: info.lastInsertRowid, qtype, stem, options: Array.isArray(q.options) ? q.options : [], kpId, kpTitle });
      } catch {}
    }

    const ids = created.map((c) => c.id);
    let sessionId = sess ? sess.id : null;
    if (sess) {
      db.prepare("UPDATE quiz_sessions SET question_ids_json=? WHERE id=?").run(JSON.stringify(ids), sess.id);
    } else {
      const info = db.prepare("INSERT INTO quiz_sessions(exam_id,user_id,parts_json,question_ids_json,filenames,fig_mids) VALUES(?,?,?,?,?,?)")
        .run(exam.id, user.id, JSON.stringify(parts), JSON.stringify(ids), srcName.slice(0, 200), JSON.stringify(figSrc.map((x) => (x ? x.materialId : null))));
      sessionId = info.lastInsertRowid;
    }
    return Response.json({ ok: true, count: created.length, questions: created, sessionId });
  } catch (e) { return aiErrorResponse(e); }
}
