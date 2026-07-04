import db, { getDocument, upsertDocument } from "@/lib/db";
import { generate, searchWeb, LANG_NAMES } from "@/lib/gemini";
import { retrieve, ragBlock, indexMaterial } from "@/lib/rag";
import { buildKnowledgeTree, generateQuestionsForKp } from "@/lib/generators";
import { APP_GUIDE } from "@/lib/appGuide";
import crypto from "crypto";

const DOC_TYPES = ["dossier", "strategy", "progress"];
const DOC_NAMES = { dossier: "考试档案", strategy: "备考策略", progress: "进度档案" };

// 写操作(会改变数据),执行前必须经用户许可
export const WRITE_TOOLS = new Set(["update_document", "web_search_and_ingest", "build_knowledge_tree", "generate_question_set", "set_profile", "set_exam_info", "rename_knowledge_point", "delete_material", "browser_task"]);

export const functionDeclarations = [
  { name: "read_document", description: "读取三份核心文档之一:dossier(考试档案)/strategy(备考策略)/progress(进度档案)", parameters: { type: "object", properties: { type: { type: "string", enum: DOC_TYPES } }, required: ["type"] } },
  { name: "update_document", description: "用新的完整 Markdown 覆盖某份核心文档。改前先 read_document。", parameters: { type: "object", properties: { type: { type: "string", enum: DOC_TYPES }, content: { type: "string" } }, required: ["type", "content"] } },
  { name: "query_knowledge_base", description: "在考生资料库中检索(RAG)", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "web_search", description: "联网搜索公开信息", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_progress_stats", description: "各知识点练习次数/正确率 + 讨论沉淀的观察" },
  { name: "get_exam_info", description: "当前考试的名称/日期/类型/学校/补充说明" },
  { name: "list_materials", description: "列出资料库里的资料" },
  { name: "list_mistakes", description: "列出最近的错题" },
  { name: "list_notes", description: "用户笔记本里的笔记(收藏的题笔记 + 自由笔记),可读" },
  { name: "get_profile", description: "读取考生个人档案(如学校信息)" },
  { name: "list_knowledge_points", description: "列出所有知识点(章→点)及资料覆盖" },
  { name: "web_search_and_ingest", description: "联网搜索某主题并把综合资料存进资料库", parameters: { type: "object", properties: { query: { type: "string" }, title: { type: "string" } }, required: ["query", "title"] } },
  { name: "build_knowledge_tree", description: "(重新)生成整个知识点树,覆盖现有" },
  { name: "generate_question_set", description: "为某知识点或整门考试批量出题存进题库", parameters: { type: "object", properties: { kpTitle: { type: "string" }, count: { type: "integer" } } } },
  { name: "set_profile", description: "更新考生个人档案(如学校信息)", parameters: { type: "object", properties: { school: { type: "string" } } } },
  { name: "set_exam_info", description: "修改当前考试的信息", parameters: { type: "object", properties: { name: { type: "string" }, examDate: { type: "string" }, notes: { type: "string" } } } },
  { name: "rename_knowledge_point", description: "重命名某个知识点", parameters: { type: "object", properties: { id: { type: "integer" }, title: { type: "string" } }, required: ["id", "title"] } },
  { name: "delete_material", description: "删除资料库里的一份资料", parameters: { type: "object", properties: { materialId: { type: "integer" } }, required: ["materialId"] } },
  { name: "browser_task", description: "当考生要你去某个需要登录的学习网站抓取/采集内容时,创建一个浏览器采集任务,由考生浏览器里的扩展在后台自动打开网页、翻页、采集进资料库。适用于:考生说去某网站采集某章/某课内容。goal 用自然语言描述要采集什么(尽量含网址或从哪开始)。", parameters: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] } }
];

// 给用户看的写操作确认文案
export function describe(name, args) {
  switch (name) {
    case "update_document": return `更新《${DOC_NAMES[args.type] || args.type}》`;
    case "web_search_and_ingest": return `联网搜索并把资料「${args.title}」存进资料库`;
    case "build_knowledge_tree": return `重建整个知识点树(会覆盖现有知识点)`;
    case "generate_question_set": return `为「${args.kpTitle || "最薄弱的知识点"}」出 ${args.count || 5} 道题`;
    case "set_profile": return `更新你的档案:学校=${args.school || ""}`;
    case "set_exam_info": return `修改考试信息:${[args.name && "名称→" + args.name, args.examDate && "日期→" + args.examDate, args.notes && "说明已更新"].filter(Boolean).join(",")}`;
    case "rename_knowledge_point": return `把知识点[${args.id}]改名为「${args.title}」`;
    case "delete_material": return `删除资料(id=${args.materialId})`;
    case "browser_task": return `让你浏览器里的采集扩展去执行:${args.goal}`;
    default: return name;
  }
}

export async function execTool(name, args, exam, user) {
  switch (name) {
    case "read_document": return { content: getDocument(exam.id, args.type)?.content_md || "(空)" };
    case "update_document": upsertDocument(exam.id, args.type, args.content); return { ok: true, note: `已更新《${DOC_NAMES[args.type]}》` };
    case "query_knowledge_base": { const hits = await retrieve(exam.id, args.query, 5); return { results: hits.length ? ragBlock(hits) : "(资料库中没有找到相关内容)" }; }
    case "web_search": { const r = await searchWeb(args.query + "(请用中文总结)"); return { summary: r.text, sources: r.sources.slice(0, 5) }; }
    case "get_progress_stats": {
      const rows = db.prepare(`SELECT kp.title, ch.title chapter, COUNT(a.id) n, COALESCE(SUM(a.correct),0) c FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id LEFT JOIN attempts a ON a.kp_id=kp.id WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL GROUP BY kp.id`).all(exam.id);
      const ins = db.prepare("SELECT text, kind FROM insights WHERE exam_id=? ORDER BY id DESC LIMIT 15").all(exam.id);
      return { stats: (rows.map((r) => `${r.chapter}/${r.title}: 练${r.n}次,对${r.c}次`).join("\n") || "(还没有练习记录)") + (ins.length ? "\n观察:\n" + ins.map((x) => `[${x.kind === "gap" ? "薄弱" : "理解"}] ${x.text}`).join("\n") : "") };
    }
    case "get_exam_info": return { info: `名称:${exam.name};类型:${exam.exam_type || "未设"};学校:${exam.school || "无"};日期:${exam.exam_date || "未定"};说明:${exam.notes || "无"}` };
    case "list_materials": { const m = db.prepare("SELECT id, filename, kind, status FROM materials WHERE exam_id=? ORDER BY id DESC").all(exam.id); return { materials: m.map((x) => `[${x.id}] ${x.filename} (${x.kind},${x.status})`).join("\n") || "(资料库为空)" }; }
    case "list_mistakes": { const rows = db.prepare(`SELECT q.body, kp.title kt FROM questions q LEFT JOIN knowledge_points kp ON kp.id=q.kp_id JOIN attempts a ON a.id=(SELECT id FROM attempts WHERE question_id=q.id ORDER BY id DESC LIMIT 1) WHERE q.exam_id=? AND q.flagged=0 AND a.correct=0 ORDER BY a.id DESC LIMIT 20`).all(exam.id); return { mistakes: rows.map((r) => `${r.kt || ""}: ${JSON.parse(r.body).stem.slice(0, 50)}`).join("\n") || "(暂无错题)" }; }
    case "list_notes": {
      const rows = db.prepare(`SELECT n.body, n.question_id, q.body qbody FROM notes n LEFT JOIN questions q ON q.id=n.question_id WHERE n.user_id=? AND (n.exam_id IS ? OR n.exam_id=?) ORDER BY n.id DESC LIMIT 50`).all(user.id, exam?.id ?? null, exam?.id ?? -1);
      const fmt = rows.map((r) => { let stem = ""; try { stem = r.qbody ? "【题】" + JSON.parse(r.qbody).stem.slice(0, 60) + " " : ""; } catch {} return "- " + stem + (r.body || "(空)"); }).join("\n");
      return { notes: fmt || "(笔记本是空的)" };
    }
    case "get_profile": { let p = {}; try { p = JSON.parse(user.profile_json || "{}"); } catch {} return { profile: JSON.stringify(p) }; }
    case "list_knowledge_points": { const rows = db.prepare(`SELECT kp.id, kp.title, kp.coverage, ch.title chapter FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL ORDER BY ch.sort, kp.sort`).all(exam.id); return { points: rows.map((r) => `[${r.id}] ${r.chapter}/${r.title} (${r.coverage})`).join("\n") || "(还没有知识点)" }; }
    case "web_search_and_ingest": {
      const r = await searchWeb(`围绕「${args.query}」搜索并综合出可用于备考的结构化资料。`);
      if ((r.text || "").trim().length < 80) return { ok: false, note: `没搜到「${args.title}」的有效内容` };
      const rec = db.prepare("INSERT INTO materials(exam_id,filename,source_url,kind,status) VALUES(?,?,?,?,?)").run(exam.id, args.title, r.sources?.[0]?.url || null, "web", "processing");
      const n = await indexMaterial(rec.lastInsertRowid, exam.id, r.text, args.title);
      db.prepare("UPDATE materials SET status='ready' WHERE id=?").run(rec.lastInsertRowid);
      return { ok: true, note: `已联网充实资料:${args.title}(${n} 段)` };
    }
    case "build_knowledge_tree": { const r = await buildKnowledgeTree(exam, user.lang); return { ok: true, note: `已生成知识点树:${r.chapters} 章 ${r.points} 点` }; }
    case "generate_question_set": {
      let kp; if (args.kpTitle) kp = db.prepare("SELECT * FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL AND title LIKE ? LIMIT 1").get(exam.id, `%${args.kpTitle}%`);
      if (!kp) kp = db.prepare(`SELECT kp.* FROM knowledge_points kp WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL ORDER BY (SELECT COUNT(*) FROM attempts a WHERE a.kp_id=kp.id) ASC, RANDOM() LIMIT 1`).get(exam.id);
      if (!kp) return { ok: false, note: "还没有知识点,请先建知识点树" };
      const n = await generateQuestionsForKp(exam, kp, Math.min(args.count || 5, 10), user.lang);
      return { ok: true, note: `已为「${kp.title}」出 ${n} 道题` };
    }
    case "set_profile": { let p = {}; try { p = JSON.parse(user.profile_json || "{}"); } catch {} if (args.school != null) p.school = args.school; db.prepare("UPDATE users SET profile_json=? WHERE id=?").run(JSON.stringify(p), user.id); return { ok: true, note: "已更新你的档案" }; }
    case "set_exam_info": { const f = []; const v = []; if (args.name) { f.push("name=?"); v.push(args.name); } if (args.examDate) { f.push("exam_date=?"); v.push(args.examDate); } if (args.notes != null) { f.push("notes=?"); v.push(args.notes); } if (f.length) { db.prepare(`UPDATE exams SET ${f.join(",")} WHERE id=?`).run(...v, exam.id); } return { ok: true, note: "已更新考试信息" }; }
    case "rename_knowledge_point": { const kp = db.prepare("SELECT id FROM knowledge_points WHERE id=? AND exam_id=?").get(args.id, exam.id); if (!kp) return { ok: false, note: "找不到该知识点" }; db.prepare("UPDATE knowledge_points SET title=? WHERE id=?").run(args.title, args.id); return { ok: true, note: `已改名为「${args.title}」` }; }
    case "delete_material": { const m = db.prepare("SELECT id FROM materials WHERE id=? AND exam_id=?").get(args.materialId, exam.id); if (!m) return { ok: false, note: "找不到该资料" }; db.prepare("DELETE FROM chunks WHERE material_id=?").run(args.materialId); db.prepare("DELETE FROM materials WHERE id=?").run(args.materialId); return { ok: true, note: "已删除该资料" }; }
    case "browser_task": {
      const rec = db.prepare("INSERT INTO browser_jobs(user_id,exam_id,goal,status) VALUES(?,?,?,'pending')").run(user.id, exam.id, String(args.goal || "").slice(0, 500));
      return { ok: true, note: `已创建浏览器采集任务:${args.goal}。请确保已安装并打开"备考助手采集"扩展(它会在后台自动执行,进度可在扩展或本页查看)。`, jobId: rec.lastInsertRowid };
    }
    default: return { error: "unknown tool" };
  }
}

export function systemPrompt(exam, user) {
  return `你是「${exam.name}」的备考管家,考生是有丰富行业经验的成年人。考试日期:${exam.exam_date || "未定"}。
你既是问答助手,也是能自主执行多步任务的备考 agent,拥有读取和修改本网站数据的能力。
- 读取类操作(读文档/查资料/看进度/列知识点/看考试信息/看档案/看资料/看错题等)会直接执行。
- 修改类操作(改文档、充实资料、建知识点树、出题、改档案/考试信息、改知识点名、删资料等)由系统在你调用后【自动】向考生弹窗征求许可并执行——你不需要、也不要在回复里提醒考生"去点允许";当你拿到工具返回的成功结果时,说明改动已经生效,正常汇报"已完成XXX"即可;若返回 declined 则说明考生拒绝了,尊重并另作打算。
职责:回答备考问题、按考生想法调整策略/档案、解读练习数据、帮找资料;考生给大目标时自己拆解成多步依次调用工具。当考生要你去某个需要登录的学习网站采集内容(如"去X网站把第3章采集进来"),用 browser_task,它由考生浏览器里的扩展执行(你无法直接访问需要登录的外部网站)。
原则:
1. 讲知识先 query_knowledge_base;资料没有的要说明"这是训练知识,未经资料证实,建议核实"。
2. 修改文档后用一句话复述改了什么。
3. 你了解本网站全部功能(见下方功能地图),用户问网站怎么用就据此回答指路。
4. 语气平实友善。回复语言默认用考生界面语言(${LANG_NAMES[user.lang] || "中文"});考生换语言就跟随;术语可保留资料原文,其余不混语言。

${APP_GUIDE}`;
}

// 跑 agent 循环:读操作直接执行;遇到写操作则挂起等待许可
export async function runAgent(contents, exam, user, toolNotes) {
  const system = systemPrompt(exam, user);
  for (let i = 0; i < 12; i++) {
    const response = await generate(null, { contents, system, tools: [{ functionDeclarations }] });
    const calls = response.functionCalls;
    if (!calls || !calls.length) {
      const reply = response.text || "(没有生成回复,请重试)";
      db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(exam.id, "model", reply);
      return { done: true, reply, toolNotes };
    }
    const modelContent = response.candidates?.[0]?.content || { role: "model", parts: calls.map((fc) => ({ functionCall: fc })) };
    contents.push(modelContent);
    if (calls.some((c) => WRITE_TOOLS.has(c.name))) {
      const token = crypto.randomBytes(16).toString("hex");
      db.prepare("INSERT INTO chat_pending(token,user_id,exam_id,contents_json,calls_json) VALUES(?,?,?,?,?)")
        .run(token, user.id, exam.id, JSON.stringify(contents), JSON.stringify(calls.map((c) => ({ name: c.name, args: c.args || {} }))));
      const actions = calls.map((c, idx) => WRITE_TOOLS.has(c.name) ? { idx, tool: c.name, desc: describe(c.name, c.args || {}) } : null).filter(Boolean);
      return { pending: true, token, actions, toolNotes };
    }
    const parts = [];
    for (const fc of calls) {
      const result = await execTool(fc.name, fc.args || {}, exam, user);
      if (result?.note) toolNotes.push(result.note);
      parts.push({ functionResponse: { name: fc.name, response: { result } } });
    }
    contents.push({ role: "user", parts });
  }
  return { done: true, reply: "(处理步数过多,已停止)", toolNotes };
}