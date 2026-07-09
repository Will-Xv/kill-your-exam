import db, { getDocument, upsertDocument } from "@/lib/db";
import { getOverallDoc, setOverallDoc } from "@/lib/overall";
import { generate, generateJson, langInstruction, searchWeb, LANG_NAMES } from "@/lib/gemini";
import { retrieve, ragBlock, indexMaterial, materialParts } from "@/lib/rag";
import { buildKnowledgeTree, rebuildKnowledgeTree, generateQuestionsForKp } from "@/lib/generators";
import { findAndStoreListening } from "@/lib/music";
import { APP_GUIDE } from "@/lib/appGuide";
import { saveChatFile } from "@/lib/files";
import { pushUser } from "@/lib/notify";
import { buildDocx, buildPdf } from "@/lib/doclib";
import { generateBlueprint, saveBlueprint, getBlueprint } from "@/lib/blueprint";
import crypto from "crypto";
import { listBricks, getBrick, runBrick } from "@/lib/bricks/index";
import { rootExamId } from "@/lib/db";
import { memoryDigest } from "@/lib/memory";
import { listCheckpoints, lastCheckpoint, restore, addLesson, getLessons, clearCheckpoints } from "@/lib/checkpoint";

const DOC_TYPES = ["dossier", "strategy", "progress"];
const DOC_NAMES = { dossier: "考试档案", strategy: "备考策略", progress: "进度档案" };

// 写操作(会改变数据),执行前必须经用户许可
// 只有敏感/破坏性/外部动作需要主人点允许;后台会自动发生的修改(改档案/策略/整体画像/出题/用户档案)直接执行
export const WRITE_TOOLS = new Set(["delete_material", "delete_knowledge_point", "clear_questions", "browser_task", "build_knowledge_tree", "rollback", "clear_checkpoints"]); // web_search_and_ingest 移出:直接执行、不弹允许

// —— 砖头(bricks)接入杀手:开发者账号可见全部;普通用户只见【已发布】的砖头。 ——
function brickPublished(name) { try { return !!db.prepare("SELECT published FROM brick_flags WHERE name=?").get(name)?.published; } catch { return false; } }
function brickVisible(name, user) { return !!getBrick(name) && (!!user?.is_developer || brickPublished(name)); } // 开发者看全部;普通账号只能用【已发布】的
function visibleBricks(user) { return listBricks().filter((b) => user?.is_developer || brickPublished(b.name)); } // 普通账号只见已发布的砖头
function brickParams(b) {
  const props = {}, required = [];
  for (const inp of (b.inputs || [])) {
    // json 类(数组/对象)统一声明成字符串,模型传 JSON 文本,执行时再 parse——最稳。
    const ty = inp.type === "number" ? "number" : inp.type === "boolean" ? "boolean" : "string";
    props[inp.key] = { type: ty, description: (inp.desc || "") + (inp.type === "json" ? "(传 JSON 文本,如 [1,2,3] 或 {\"a\":1})" : "") };
    if (inp.required) required.push(inp.key);
  }
  return { type: "object", properties: props, required };
}
function brickToolDecls(user) {
  return visibleBricks(user).map((b) => ({ name: b.name, description: `[砖头·${b.category}] ${b.title}:${(b.description || "").slice(0, 400)}`, parameters: brickParams(b) }));
}
// 传给模型的完整工具清单 = 内置工具 + 该用户可见的砖头
function declsFor(user) { return [...functionDeclarations, ...brickToolDecls(user)]; }
// 是否写操作(需主人点允许):内置写工具,或 write=true 的砖头
export function isWrite(name) { return WRITE_TOOLS.has(name) || !!getBrick(name)?.write; }
// 无考试时也能用的、与具体考试无关的工具
const NOEXAM_TOOLS = new Set(["web_search", "read_overall_profile", "update_overall_profile", "get_profile", "set_profile"]);
// 聊天归属键:有考试用家族根;无考试用 -用户id 作为该用户的“无考试对话”哨兵键
function chatKey(exam, user) { return exam ? rootExamId(exam.id) : -Number(user.id); }

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
  { name: "read_overall_profile", description: "读取用户的整体画像(跨所有考试的长期档案)" },
  { name: "get_profile", description: "读取考生个人档案(如学校信息)" },
  { name: "list_knowledge_points", description: "列出所有知识点(章→点)及资料覆盖" },
  { name: "web_search_and_ingest", description: "联网搜索某主题并把综合资料存进资料库", parameters: { type: "object", properties: { query: { type: "string" }, title: { type: "string" } }, required: ["query", "title"] } },
  { name: "clear_checkpoints", description: "清空主人的全部回档存档点(后悔药历史)。主人明确要求清理时才用;会弹确认。" },
  { name: "list_checkpoints", description: "列出最近的结构性操作检查点(重建/合并知识树、跨考试复制、挂父、开汇总等),含 id、操作、说明、时间、是否已撤销。用于回答“我做过哪些可撤销的改动”或找到要回档的目标。" },
  { name: "rollback", description: "回档:把某次结构性操作还原到它执行前的状态。省略 checkpointId=撤销【最近一次】未撤销的操作(“撤销刚才那次”)。破坏性还原(会覆盖当前状态),会弹确认。dueTo:这次撤销的原因——bug=发现了问题/AI 做错了(此时【必须】在 lesson 里用一句话写下教训,会记入长期教训库、避免重犯);preference=主人只是改主意/换需求(【不要】写 lesson、不吸取教训);other=其它。", parameters: { type: "object", properties: { checkpointId: { type: "integer", description: "要回档到的检查点 id;省略=最近一次" }, dueTo: { type: "string", enum: ["bug", "preference", "other"], description: "撤销原因" }, lesson: { type: "string", description: "仅当 dueTo=bug 时填:教训一句话" } } } },
  { name: "build_knowledge_tree", description: "重新生成整个知识点树(会删掉现有知识点重建,属于危险操作,会弹确认)。【必须先问主人】旧的做题记录和掌握度怎么处理,再据此设 retain:keep=把旧记录按语义迁移到新知识点(默认、最稳);summarize=把旧表现浓缩成观察挂到新知识点、清掉原始做题记录;none=清掉记录与观察干净重来(题库保留)。不要替主人擅自决定 retain。", parameters: { type: "object", properties: { retain: { type: "string", enum: ["keep", "summarize", "none"] }, timeBudgetMin: { type: "number", description: "若主人希望在约 X 分钟内复习完(如小测),传入分钟数,知识点树会据此精简篇幅" }, emphasis: { type: "string", description: "本次侧重(只围绕它展开,可选)" } } } },
  { name: "generate_question_set", description: "为某知识点或整门考试批量出题存进题库", parameters: { type: "object", properties: { kpTitle: { type: "string" }, count: { type: "integer" } } } },
  { name: "add_listening_audio", description: "为这门考试找一段【公有领域/开放许可】的真人英语听力音频(合法免版权,来自 LibriVox 等)加进「补充资料」;之后据它出原创听力题。听力类考试缺音频时用。", parameters: { type: "object", properties: {} } },
  { name: "customize_mock_blueprint", description: "定制/重新规划这门考试的「模拟考蓝图」(正式考试结构:考哪些知识点、各出几题、题型分值、总分、时长)。主人说想让模拟考多考某类题/改总分/重点考某章/加某题型等,用这个。instructions 用自然语言写主人的要求。之后模拟考会按新蓝图组卷。", parameters: { type: "object", properties: { instructions: { type: "string" } }, required: ["instructions"] } },
  { name: "send_file", description: "生成一个文件发给主人下载(比如错题整理、复习提纲、笔记汇总、导出题目、学习计划表等)。你把文件内容写在 content 里,选好格式;工具会返回下载链接——你【必须】在回复里用 Markdown 链接 [文件名](链接) 把它呈现给主人。format 支持:pdf、docx(Word)、md(Markdown)、txt(纯文本)、csv(表格,逗号分隔、首行表头)、html。pdf/docx/md 里可用 Markdown(# 标题、- 列表、**加粗**),会转成排版好的文档(支持中文)。", parameters: { type: "object", properties: { filename: { type: "string", description: "文件名(可不带扩展名,会按 format 自动补)" }, content: { type: "string", description: "文件的完整内容;pdf/docx/md 可用 Markdown 语法排版" }, format: { type: "string", enum: ["pdf", "docx", "md", "txt", "csv", "html"] } }, required: ["filename", "content"] } },
  { name: "set_profile", description: "更新考生个人档案(如学校信息)", parameters: { type: "object", properties: { school: { type: "string" } } } },
  { name: "set_exam_info", description: "修改当前考试的信息", parameters: { type: "object", properties: { name: { type: "string" }, examDate: { type: "string" }, notes: { type: "string" } } } },
  { name: "rename_knowledge_point", description: "重命名某个知识点", parameters: { type: "object", properties: { id: { type: "integer" }, title: { type: "string" } }, required: ["id", "title"] } },
  { name: "delete_material", description: "删除资料库里的一份资料", parameters: { type: "object", properties: { materialId: { type: "integer" } }, required: ["materialId"] } },
  { name: "browser_task", description: "当考生要你去某个需要登录的学习网站抓取/采集内容时,创建一个浏览器采集任务,由考生浏览器里的扩展在后台自动打开网页、翻页、采集进资料库。适用于:考生说去某网站采集某章/某课内容。goal 用自然语言描述要采集什么(尽量含网址或从哪开始)。", parameters: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] } },
  { name: "update_overall_profile", description: "用新的完整 Markdown 覆盖用户的整体画像(跨所有考试的长期档案)。改前先 read_overall_profile,在原内容基础上修改。", parameters: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } },
  { name: "add_knowledge_point", description: "在学习目标(知识点树)里新增一个知识点。chapter 传所属章节名(没有会归到最合适的现有章节或「补充」)。", parameters: { type: "object", properties: { chapter: { type: "string" }, title: { type: "string" } }, required: ["title"] } },
  { name: "delete_knowledge_point", description: "从学习目标里删除一个知识点(按 id 或标题)", parameters: { type: "object", properties: { id: { type: "integer" }, title: { type: "string" } } } },
  { name: "refresh_daily_plan", description: "重新生成今天的今日任务(按最新的薄弱点和资料重排)" },
  { name: "set_daily_plan", description: "自定义今天的今日任务:kpTitles 是要练的知识点标题列表,freeTarget 是自由练习目标题数,includeReview 是否包含错题复习(默认含)", parameters: { type: "object", properties: { kpTitles: { type: "array", items: { type: "string" } }, freeTarget: { type: "integer" }, includeReview: { type: "boolean" } } } },
  { name: "clear_questions", description: "清空题库题目,用于换语言/换题型/风格不对后重出题。范围务必按用户意图选,避免误删记录:【安全默认】all 省略或 false —— 只删【还没做过】的题,做过的题与作答/成绩记录全部保留;【危险】all=true —— 连做过的题及其作答/成绩记录一起【永久删除、不可恢复】,只有用户明确说\"连做过的/包括记录/全部彻底删\"时才用。【部分删除】填 kpTitle 只清某一个知识点下的题(可与 all 组合);不填 kpTitle 就是整门考试。不确定用户要不要删做过的记录时,默认用安全模式(不删记录),或先问清楚。", parameters: { type: "object", properties: { kpTitle: { type: "string", description: "只清这个知识点下的题(部分删除);省略=整门考试" }, all: { type: "boolean", description: "true=连做过的题和作答/成绩记录一起永久删(危险);省略/false=只删没做过的、保留记录(安全)" } } } }
];

// 给用户看的写操作确认文案
export function describe(name, args) {
  switch (name) {
    case "update_document": return `更新《${DOC_NAMES[args.type] || args.type}》`;
    case "web_search_and_ingest": return `联网搜索并把资料「${args.title}」存进资料库`;
    case "build_knowledge_tree": { const mm = { keep: "完全保留旧做题记录并迁移", summarize: "把旧表现浓缩成观察、清掉原始做题记录", none: "清空做题记录与观察,干净重来" }[args.retain || "keep"]; return `重建整个知识点树(会删掉现有知识点重建;${mm};题库保留)`; }
    case "generate_question_set": return `为「${args.kpTitle || "最薄弱的知识点"}」出 ${args.count || 5} 道题`;
    case "add_listening_audio": return `找一段免版权(公有领域)的听力音频加进补充资料`;
    case "send_file": return `生成文件「${args.filename || "file"}」发给你下载`;
    case "customize_mock_blueprint": return `按你的要求重新规划模拟考蓝图`;
    case "set_profile": return `更新你的档案:学校=${args.school || ""}`;
    case "set_exam_info": return `修改考试信息:${[args.name && "名称→" + args.name, args.examDate && "日期→" + args.examDate, args.notes && "说明已更新"].filter(Boolean).join(",")}`;
    case "rename_knowledge_point": return `把知识点[${args.id}]改名为「${args.title}」`;
    case "delete_material": return `删除资料(id=${args.materialId})`;
    case "delete_knowledge_point": return `从学习目标里删除知识点${args.title ? "「" + args.title + "」" : "(id=" + args.id + ")"}`;
    case "clear_questions": { const scope = args.kpTitle ? `「${args.kpTitle}」` : "这门考试"; return args.all
      ? `⚠️ 永久删除${scope}的【全部】题目 —— 连你【做过的题及其作答/成绩记录】一起删掉,不可恢复`
      : `清空${scope}里【还没做过】的题(你做过的题和作答/成绩记录都会保留)`; }
    case "browser_task": return `让你浏览器里的采集扩展去执行:${args.goal}`;
    case "update_overall_profile": return `更新你的整体画像(跨所有考试的长期档案)`;
    case "rollback": return args.checkpointId ? `回档到检查点 #${args.checkpointId}(还原该结构操作前的状态)` : `撤销最近一次结构操作(回档到它执行前)`;
    case "clear_checkpoints": return "清空全部回档存档点(不可再撤销之前的操作)";
    default: { const b = getBrick(name); if (b) return b.title; return name; }
  }
}

export async function execTool(name, args, exam, user) {
  // 无考试模式:只放行跨考试砖头和少数与考试无关的工具;其余需要“当前考试”的工具给出引导性错误。
  if (!exam && !NOEXAM_TOOLS.has(name) && !brickVisible(name, user)) {
    return { error: "现在还没有任何考试。请先通过对话弄清主人要考什么/学什么,再用 exam_provision(或 exam_create)砖头把考试建起来;建好后其它工具才有对象。" };
  }
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
    case "list_materials": { const m = db.prepare("SELECT id, filename, kind, status, auto FROM materials WHERE exam_id=? ORDER BY id DESC").all(exam.id); return { materials: m.map((x) => `[${x.id}] ${x.filename} (${x.kind},${x.status})${x.auto ? " [系统自动配乐,非用户上传]" : ""}`).join("\n") || "(资料库为空)" }; }
    case "list_mistakes": { const rows = db.prepare(`SELECT q.body, kp.title kt FROM questions q LEFT JOIN knowledge_points kp ON kp.id=q.kp_id JOIN attempts a ON a.id=(SELECT id FROM attempts WHERE question_id=q.id ORDER BY id DESC LIMIT 1) WHERE q.exam_id=? AND q.flagged=0 AND a.correct=0 ORDER BY a.id DESC LIMIT 20`).all(exam.id); return { mistakes: rows.map((r) => `${r.kt || ""}: ${JSON.parse(r.body).stem.slice(0, 50)}`).join("\n") || "(暂无错题)" }; }
    case "read_overall_profile": return { profile: getOverallDoc(user) || "(整体画像还是空的)" };
    case "update_overall_profile": { setOverallDoc(user.id, args.content || ""); return { ok: true, note: "已更新整体画像" }; }
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
    case "build_knowledge_tree": { const r = await rebuildKnowledgeTree(exam, user.lang, args.retain || "keep", { timeBudgetMin: args.timeBudgetMin ? Number(args.timeBudgetMin) : null, emphasis: args.emphasis || "" }); const mm = { keep: "完全保留旧记录", summarize: "旧表现已浓缩为观察", none: "已清空旧记录" }[r.mode] || r.mode; return { ok: true, note: `已重建知识点树:${r.chapters} 章 ${r.points} 点(${mm})` }; }
    case "add_listening_audio": {
      const id = await findAndStoreListening(exam.id);
      if (!id) return { ok: false, note: "暂时没找到合适的免版权听力音频,可稍后再试,或让主人自己上传一段音频。" };
      return { ok: true, note: "已加入一段【公开授权】的听力音频到「补充资料」。现在可以让我据它出原创听力题了(练习时能播放、听后作答)。" };
    }
    case "customize_mock_blueprint": {
      try { const bp = await generateBlueprint(exam, user, args.instructions || ""); saveBlueprint(exam.id, bp); return { ok: true, note: `已按要求重排模拟考蓝图(总分 ${bp.totalMarks || "?"}、约 ${(bp.plan || []).reduce((a, b) => a + (b.count || 0), 0)} 题),下次模拟考按它组卷。`, overview: bp.overview }; }
      catch { return { ok: false, note: "重排蓝图失败,请稍后再试。" }; }
    }
    case "send_file": {
      const fmt = ["pdf", "docx", "md", "txt", "csv", "html"].includes(args.format) ? args.format : "md";
      const mime = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", md: "text/markdown", txt: "text/plain", csv: "text/csv", html: "text/html" }[fmt];
      let name = String(args.filename || "file").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
      if (!new RegExp("\\." + fmt + "$", "i").test(name)) name = name.replace(/\.[a-z0-9]{1,5}$/i, "") + "." + fmt;
      let buf;
      try {
        if (fmt === "docx") buf = await buildDocx(String(args.content || ""));
        else if (fmt === "pdf") buf = await buildPdf(String(args.content || ""));
        else buf = Buffer.from(String(args.content || ""), "utf8");
      } catch (e) { return { ok: false, note: "生成文件失败,请稍后再试或换一种格式(md/txt)。" }; }
      const ins = db.prepare("INSERT INTO chat_files(exam_id,user_id,filename,mime) VALUES(?,?,?,?)").run(exam.id, user.id, name, mime);
      const id = ins.lastInsertRowid;
      try { saveChatFile(id, buf); } catch {}
      const url = `/api/chat/file?id=${id}`;
      return { ok: true, filename: name, url, note: `文件已生成:[${name}](${url})`, instruction: `请在给主人的回复里,用 Markdown 链接把下载链接呈现出来:[${name}](${url})` };
    }
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
    case "add_knowledge_point": {
      let chId = null;
      if (args.chapter) { const ch = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL AND title LIKE ? LIMIT 1").get(exam.id, `%${args.chapter}%`); chId = ch?.id; }
      if (!chId) { const any = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL ORDER BY sort LIMIT 1").get(exam.id); chId = any ? any.id : db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,sort,coverage) VALUES(?,?,?,?,?)").run(exam.id, null, args.chapter || "补充", 999, "none").lastInsertRowid; }
      db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,sort,coverage) VALUES(?,?,?,?,?)").run(exam.id, chId, args.title, 999, "none");
      return { ok: true, note: `已在学习目标里新增知识点「${args.title}」` };
    }
    case "delete_knowledge_point": {
      let kp = args.id ? db.prepare("SELECT id, title FROM knowledge_points WHERE id=? AND exam_id=?").get(args.id, exam.id) : null;
      if (!kp && args.title) kp = db.prepare("SELECT id, title FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL AND title LIKE ? LIMIT 1").get(exam.id, `%${args.title}%`);
      if (!kp) return { ok: false, note: "找不到该知识点" };
      db.prepare("DELETE FROM knowledge_points WHERE id=? OR parent_id=?").run(kp.id, kp.id);
      return { ok: true, note: `已从学习目标删除「${kp.title}」` };
    }
    case "clear_questions": {
      let kpId = null;
      if (args.kpTitle) { const kp = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL AND title LIKE ? LIMIT 1").get(exam.id, `%${args.kpTitle}%`); if (kp) kpId = kp.id; }
      const kpFilter = kpId ? " AND kp_id=?" : "";
      const kpParams = kpId ? [kpId] : [];
      if (args.all) {
        // 连做过的题也删:先删这些题的作答记录,再删题目本身
        db.prepare(`DELETE FROM attempts WHERE question_id IN (SELECT id FROM questions WHERE exam_id=?${kpFilter})`).run(exam.id, ...kpParams);
        const info = db.prepare(`DELETE FROM questions WHERE exam_id=?${kpFilter}`).run(exam.id, ...kpParams);
        return { ok: true, note: `已清空 ${info.changes} 道题(含做过的,作答记录一并删除);下次练习会按最新设置重新出题。` };
      }
      const info = db.prepare(`DELETE FROM questions WHERE exam_id=? AND id NOT IN (SELECT question_id FROM attempts)${kpFilter}`).run(exam.id, ...kpParams);
      return { ok: true, note: `已清空 ${info.changes} 道还没做过的题(做过的保留;若要连做过的一起删,请说\"清空所有题\");下次练习会按最新设置重新出题。` };
    }
    case "refresh_daily_plan": { const today = new Date().toLocaleDateString("sv-SE"); db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today); return { ok: true, note: "今日任务已刷新(回首页即按最新情况重排)" }; }
    case "set_daily_plan": {
      const today = new Date().toLocaleDateString("sv-SE");
      const items = [];
      if (args.includeReview !== false) items.push({ type: "review" });
      for (const t of (args.kpTitles || [])) { const kp = db.prepare("SELECT kp.id, kp.title, ch.title chapter FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL AND kp.title LIKE ? LIMIT 1").get(exam.id, `%${t}%`); if (kp) items.push({ type: "kp", kpId: kp.id, title: kp.title, chapter: kp.chapter }); }
      items.push({ type: "free", target: args.freeTarget || 10 });
      db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today);
      db.prepare("INSERT INTO daily_plans(exam_id,date,items_json,completed) VALUES(?,?,?,0)").run(exam.id, today, JSON.stringify(items));
      return { ok: true, note: `今日任务已设为:${items.filter((i) => i.type === "kp").map((i) => i.title).join("、") || "复习 + 自由练习"}` };
    }
    case "delete_material": { const m = db.prepare("SELECT id FROM materials WHERE id=? AND exam_id=?").get(args.materialId, exam.id); if (!m) return { ok: false, note: "找不到该资料" }; db.prepare("DELETE FROM chunks WHERE material_id=?").run(args.materialId); db.prepare("DELETE FROM materials WHERE id=?").run(args.materialId); return { ok: true, note: "已删除该资料" }; }
    case "browser_task": {
      const rec = db.prepare("INSERT INTO browser_jobs(user_id,exam_id,goal,status) VALUES(?,?,?,'pending')").run(user.id, exam.id, String(args.goal || "").slice(0, 500));
      return { ok: true, note: `已创建浏览器采集任务:${args.goal}。请确保已安装并打开"备考助手采集"扩展(它会在后台自动执行,进度可在扩展或本页查看)。`, jobId: rec.lastInsertRowid };
    }
    case "list_checkpoints": { const cps = listCheckpoints(user.id, 20); return { checkpoints: cps.map((c) => `#${c.id} [${c.op}] ${c.label} · ${c.created_at}${c.undone ? " (已撤销)" : ""}`).join("\n") || "(还没有可回档的操作)" }; }
    case "clear_checkpoints": { const n = clearCheckpoints(user.id); return { ok: true, note: `已清空 ${n} 个回档存档点。` }; }
    case "rollback": {
      const target = args.checkpointId ? { id: Number(args.checkpointId) } : lastCheckpoint(user.id);
      if (!target) return { ok: false, note: "没有可撤销的操作" };
      let r; try { r = restore(target.id, user.id); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
      const learn = args.dueTo === "bug" && args.lesson;
      if (learn) { try { addLesson(user.id, args.lesson); } catch {} }
      return { ok: true, note: `已回档:撤销了「${r.label || r.op}」(检查点 #${r.id})${learn ? ",并记下教训(因为这次是发现了问题)" : ""}。相关考试已还原到该操作前的状态。` };
    }
    default: {
      // 砖头调用:开发者可用全部,普通用户仅限已发布
      if (brickVisible(name, user)) {
        try {
          const a = { ...(args || {}) };
          const b = getBrick(name);
          for (const inp of (b.inputs || [])) if (inp.type === "json" && typeof a[inp.key] === "string") { try { a[inp.key] = JSON.parse(a[inp.key]); } catch {} }
          const out = await runBrick(name, a, { user, exam });
          return { ok: true, brick: name, result: out };
        } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
      }
      return { error: "unknown tool" };
    }
  }
}

export function systemPrompt(exam, user) {
  const overallDoc = getOverallDoc(user);
  const memory = memoryDigest(user.id);
  const lessons = getLessons(user.id, 8);
  if (!exam) {
    return `你是「主人」的私人「杀手」(Ask Killer)。主人【现在还没有任何考试】。称呼主人为「主人」,语气利落、可靠、真诚。回复语言默认用主人界面语言(${LANG_NAMES[user.lang] || "中文"})。
【你现在唯一的任务:通过对话帮主人从零创建一门考试/学习任务。】
- 先弄清楚:主人要考什么/学什么、类型(学校考试 / 职业资格 / 语言考试 / 升学考试 / 其它 / 只学习)、大概什么时候考、有没有资料或特别侧重。缺什么就问什么,别一次问太多。
- 信息够了就用 **exam_provision** 砖头把考试建起来:它会在后台生成知识点树和备考策略、立即返回(不用干等),是否联网搜这门考试的公开信息由你按情况问主人决定(webSearch 参数)。若主人只想先要一个空壳,用 **exam_create**。想先看主人已有哪些考试用 **exam_list**。
- 【工具限制】此时你【只能】用跨考试砖头(exam_provision / exam_create / exam_list 等)和少数与考试无关的工具(联网搜索、读/改整体画像、读/改个人档案)。【不要】调用需要“当前考试”的工具(读文档、出题、看进度、改策略、重建知识树等)——现在没有对象,调了也会被拒。
【诚实铁律】只能汇报工具【实际返回】的结果;没做成就如实说、绝不编造成功;不确定就说不确定。
【先说清再动手】做不到或只能打折扣时,动手前先如实说清、等主人明确指示再执行。
${overallDoc ? "\n【主人的整体画像(跨所有考试的长期档案)】\n" + overallDoc.slice(0, 1200) + "\n" : ""}${memory ? "\n【长期记忆(冲突并存、以最新为主导、可追溯)】\n" + memory + "\n" : ""}${lessons.length ? "\n【过往教训】\n" + lessons.map((l) => "- " + l).join("\n") + "\n" : ""}`;
  }
  return `你是「主人」的私人「杀手」(Ask Killer)——受雇于主人,职责只有一个:帮主人干掉「${exam.name}」这场考试。考试日期:${exam.exam_date || "未定"}。主人是有丰富行业经验的成年人。称呼考生为「主人」(其它语言用对应的敬称,如英文 Master),语气利落、可靠、带一点杀手的冷静自信,但始终真诚、有用、不油腻。
你既是问答助手,也是能自主执行多步任务的备考 agent,拥有读取和修改本网站数据的能力。
- 读取类操作(读文档/查资料/看进度/列知识点/看考试信息/看档案/看资料/看错题等)直接执行。
- 后台/会自动发生的修改(改考试档案、改备考策略、更新「你的全部杀技」整体画像、出题入库、改用户档案、改考试基本信息、重建知识点树等——主人看不到的后台文件、或后台本来也会自动更改的东西)【直接执行,无需征求许可】,拿到成功结果就正常汇报"已办妥"。
- 你能直接**增删学习目标(知识点)**、**刷新或自定义「今日任务」**、给知识点改名(这些学习目标/计划后台本来也会自动更新,直接执行、不用问)。另外:主人一上传/采集资料,系统就会自动按新资料补充知识点、重算掌握度、刷新今日任务。
- 只有「主人能看到、且后台不会轻易自己改」的动作才需要系统弹窗请主人点允许:删除资料、删除某个学习目标(知识点)、联网搜集新资料、指挥主人的浏览器去外部网站采集。你调用后系统会自动弹窗,你不必在回复里提醒主人"去点允许";成功就汇报,若返回 declined 就尊重主人的决定、另作打算。
职责:回答备考问题、按主人想法调整策略/档案、解读练习数据、帮找资料;主人给大目标时自己拆成多步依次调用工具。主人要你去某个需要登录的学习网站采集内容(如"去X网站把第3章采集进来"),用 browser_task,由主人浏览器里的扩展执行(你无法直接访问需要登录的外部网站)。
【诚实铁律 · 最高优先级】
- 只能汇报工具【实际返回】的结果。工具没调用/没成功,就【绝不能】说"已删除/已生成/已办妥"。宁可如实说"没做成、原因是X",也不许编造成功。
- 严禁虚构任何技术过程或托辞,例如"侵入后台、天眼、用强碱溶解缓存、浏览器缓存锁死、后台判定缓存"等——这些都是假话。数据在服务器数据库里,和浏览器缓存无关;不要甩锅给缓存或让主人去 Ctrl+F5。
- 汇报要带真实数字:清空题目就说清工具返回删了几道(clear_questions 的 note 里有);出题就说实际入库几道。
- 关于清空题目:clear_questions 默认(安全)只删【没做过】的题、保留做过的题和作答/成绩记录。只有主人【明确】要删掉做过的题或其记录(如"连做过的一起删/把记录也清了/全部彻底删")时,才把 all 设为 true——这会永久删记录、不可恢复,别轻易用。
- 若主人只是说"旧题还在/没换成新题",那多半是练习页的本地暂存,先让他点练习页的【🔄 换一批】或重新【开始自由练习】,【不要】因此就去删他做过的题和记录。
- 只想清某个知识点的题就带上 kpTitle(部分删除),不必清整门考试。
- 出完新题后,若主人说"旧题还在":练习页当前那一批题是【浏览器本地暂存】的(方便刷新不丢进度),不是没删干净。正确指引是:让主人点练习页右上角的【🔄 换一批】按钮,或从「学习」页重新点【开始自由练习】,就会拉到刚出的新题——【不要】让主人去按 Ctrl+F5、也不要说什么"后台缓存/强碱溶解"之类的假话。
- 不要吹嘘不存在的能力;不确定就说不确定。真诚、准确比听起来厉害重要。
【能力边界 · 先说清楚再动手(最高优先级之一)】
- 你只拥有本次对话里【实际提供给你的工具】(下方函数/砖头列表 + 各自说明)。要清楚每个工具能做什么、不能做什么;【不要臆想自己没有的能力】,也别把"能力相近"当成"能做到"。拿不准某个工具能不能做到某事,就照它的说明老实判断,不确定就说不确定。
- 接到任务【先判断可行性】:用现有工具到底能不能做成、能不能做到让主人满意。若【做不到】,或只能【部分做到 / 用打折扣的方式做到】,你【必须在动手之前】就如实告诉主人——哪些能做、哪些做不到、替代方案各有什么取舍——然后【停下来等主人明确说要怎么办】,拿到明确指示后才开始执行。【在此之前不要调用任何写操作、不要开始多步任务。】
- 【严禁】闷头用一个"差不多"的替代做法顶上去再汇报成功;也【严禁】为了显得能干,硬做出一个不符合主人本意的结果。宁可先把话说清、先问。
- 只有当现有工具确实能干净利落地满足主人要求时,才直接按规矩执行(读取类直接做,写入类走确认门)。若一个大目标里有些部分能做、有些做不到,先说清全貌、让主人决定要不要只做能做的那部分,再动手。
原则:
1. 讲知识先 query_knowledge_base;资料没有的要说明"这是训练知识,未经资料证实,建议核实"。
2. 你了解本网站全部功能(见下方功能地图),主人问网站怎么用就据此指路。
3. 回复语言默认用主人界面语言(${LANG_NAMES[user.lang] || "中文"});主人换语言就跟随;术语可保留资料原文,其余不混语言。
${overallDoc ? "\n【主人的整体画像(即「你的全部杀技」,跨所有考试的长期档案,据此了解主人)】\n" + overallDoc.slice(0, 1500) + "\n" : ""}${memory ? `
【长期记忆 · 情景+语义(按新近×权重,冲突并存、可追溯)】
${memory}
【怎么用这层记忆】
- 以【当前主导】(最新、权重高)那条为主,但【历史】不作废、可追溯;不要因为有新说法就假装旧事实没发生过。
- 新旧【冲突】时(如“曾自认数学弱”↔“现自称已很强、别推基础题”),【不要简单否定任何一方】:采取折中并【说明依据】。例如:“你以前在数学上偏弱、现在说已经很强了,那我先给中档题验证一下,如果轻松就直接上难题,如何?”
- 主人纠正你时,把纠正当作【新的记忆】(会自动记下),据此更新当前主导,但仍保留旧记录。
- 这些是主人【自己的说法】,不等于客观事实;可与做题数据(掌握度)相互印证,冲突时如实指出、请主人确认。` : ""}${lessons.length ? `
【过往教训(你或主人撤销操作后沉淀的,务必记住、别重犯)】
${lessons.map((l) => "- " + l).join("\n")}` : ""}
【新建/关联考试的规矩(用砖头)】
- 主人要新增一门考试(尤其和现有考试有关联,如某门课的小测、期中、期末),用 exam_provision 砖头:它建好考试并在【后台】生成内容,立即返回,你【不要干等】,拿到 examId 就先汇报"已在后台生成,几分钟后就绪",再继续别的事。追杀计划里会显示生成进度。
- 【默认带内容】建考试默认用 **exam_provision**(会生成知识树/蓝图、进度可见);只有主人【明确】说"只要个空壳/占位、内容以后再说"时才用 exam_create。哪怕主人只给了名字(如"Quiz 1"),也优先 exam_provision——可按父课程的主题生成,主人不满意再调整;别一上来全建空壳,那样没有任何可见的生成过程。
- 【依赖判断】能实时汇总的操作不用等内容:把小测挂到母考试下(exam_set_parent)+开汇总(exam_set_aggregate)当场就能接好,小测内容生成完会自动并入。只有真正需要新考试【内容】的步骤(exam_copy_kps / exam_match_kps / exam_promote_weak)才要先用 exam_gen_status 确认 ready,没就绪就先搁着、告诉主人"等它生成好我再接着做",别对空考试硬跑。
- 【新建母考试(在若干已有考试之上)】必须先问主人:旧考试的内容怎么处理?给四个大白话选项——①实时汇总:不搬运,母考试直接把这些考试合起来复习(推荐、最省);②把知识点和掌握情况总结后搬过去(还要再问一句要不要连题一起搬);③只把有价值的题搬过去(只从做错的和还没做过的题里挑);④把全部知识点和题都复制过去。按选择设 carryMode(live/summarize/partial/copy_all)+ carryWithQuestions。别用"映射"这种词,就说"搬过去/合起来复习"。
- 【新建子任务(小测等)】不要默认照搬母考试的全部信息——小测和期末侧重可能不同。先问主人本次的具体情况:考哪些内容/侧重什么、多长时间、要不要单独联网搜这门小测的信息(默认沿用母考试),把这些填进 notes/emphasis/durationMin/webSearch。若主人想按某个时间复习完(如"这次小测不长,我想用一小时复习完全部"),把 timeBudgetMin 设成 60,系统会据此生成一份该时长的紧凑复习计划,并据主人说明灵活调整知识点结构。
【回档(后悔药)· 要能用白话跟主人讲清楚】
- 你对知识树/考试结构做的每一次大改(重建/合并知识树、跨考试复制/语义映射、挂父、开汇总、提拔薄弱)都会【自动存一个还原点】。主人想撤销就用 rollback(省略 id=撤销最近一次);想看有哪些能撤用 list_checkpoints;想清理历史用 clear_checkpoints。
- 用大白话解释这套机制,别用“检查点/快照”这种词:例如“这些大改我都留了‘后悔药’,你随时能让我撤销刚才那次、或更早某次;默认保留最近 40 次改动、最多 60 天,更早的会自动清掉,不占地方。”
- 【吸取教训的边界】只有当撤销是因为【发现了问题 / 你(AI)做错了】时,才在 rollback 里 dueTo=bug 并写一句教训(会长期记住、避免重犯);如果主人只是【改主意、换需求】,dueTo=preference、【不要】写教训——那不是错,不该被当成教训。
${APP_GUIDE}`;
}

// 跑 agent 循环:读操作直接执行;遇到写操作则挂起等待许可
export async function runAgent(contents, exam, user, toolNotes) {
  const system = systemPrompt(exam, user);
  // 把资料库图片/音频作为多模态附件塞进最后一条用户消息(仅一次;resume 时已含 inlineData 不再重复)
  try {
    const mp = materialParts(exam.id, { max: 3, maxBytes: 12 * 1024 * 1024 });
    if (mp.length) {
      const lu = [...contents].reverse().find((c) => c.role === "user" && Array.isArray(c.parts));
      if (lu && !lu.parts.some((p) => p.inlineData)) lu.parts = [...lu.parts, ...mp];
    }
  } catch {}
  for (let i = 0; i < 12; i++) {
    const response = await generate(null, { contents, system, tools: [{ functionDeclarations: declsFor(user) }] });
    const calls = response.functionCalls;
    if (!calls || !calls.length) {
      const reply = response.text || "(没有生成回复,请重试)";
      db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(chatKey(exam, user), "model", reply);
      return { done: true, reply, toolNotes };
    }
    const modelContent = response.candidates?.[0]?.content || { role: "model", parts: calls.map((fc) => ({ functionCall: fc })) };
    contents.push(modelContent);
    if (calls.some((c) => isWrite(c.name))) {
      const token = crypto.randomBytes(16).toString("hex");
      db.prepare("INSERT INTO chat_pending(token,user_id,exam_id,contents_json,calls_json) VALUES(?,?,?,?,?)")
        .run(token, user.id, exam.id, JSON.stringify(contents), JSON.stringify(calls.map((c) => ({ name: c.name, args: c.args || {} }))));
      const actions = calls.map((c, idx) => isWrite(c.name) ? { idx, tool: c.name, desc: describe(c.name, c.args || {}) } : null).filter(Boolean);
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
// ===== 后台运行的杀手(离线也继续,过程写进 chat_runs 供前端轮询) =====
// 是否可能是复杂/多步/动系统的请求(启动 planner 的廉价前置门槛;简单请求直接跳过、不多花调用)
function maybeComplex(text) {
  const t = String(text || "");
  if (t.length < 24) return false;
  return /(然后|再|接着|并且|同时|之后|保留|迁移|重排|重新排列|重建|批量|所有|每一|删除|清空|换成|题型树|思维树|遗忘曲线|工作流|workflow|小任务|掌握度|不重复|全部|依次|分别)/.test(t) || t.length > 80;
}
// 规划模块:判断是否复杂,复杂则产出一份给主人看的有序步骤计划(一次调用)
async function makePlan(ask, user, extra = {}) {
  const toolList = declsFor(user).map((f) => `- ${f.name}: ${(f.description || "").slice(0, 60)}`).join("\n");
  const schema = { type: "object", properties: {
    complex: { type: "boolean" }, summary: { type: "string" },
    steps: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } }, required: ["title"] } }
  }, required: ["complex"] };
  let prompt = `你是「杀手」的规划模块。判断主人这次的请求是不是【复杂/多步/有先后依赖/会动到知识点·记录·题库·大批量生成】的任务。
- 简单问答、讲解、闲聊、或一步就能完成的小事 => complex=false,steps 留空。
- 复杂任务 => complex=true,给一份【给主人看的】有序步骤计划:每步 title 一句话说做什么,detail 补关键点(顺序、会保留/删除什么、注意事项)。3~7 步为宜,别啰嗦。
只能用下列真实能力来规划,别编不存在的:
${toolList}
主人的请求:${String(ask).slice(0, 2000)}`;
  if (extra && extra.feedback) {
    prompt += `\n\n这是【修改】上一版计划:complex 保持 true。上一版计划:${JSON.stringify(extra.prevPlan || {}).slice(0, 1500)}\n主人对上一版计划的意见/希望改动:${String(extra.feedback).slice(0, 1000)}\n请据此调整计划,尽量满足主人的意见。`;
  }
  prompt += langInstruction(user.lang);
  try { return await generateJson(prompt, schema, {}); } catch { return { complex: false }; }
}
// 工具的可读标签(写操作用 describe;读操作给个友好说法,让过程更透明)
function toolLabel(name, args) {
  const d = describe(name, args); if (d) return d;
  const a = args || {};
  switch (name) {
    case "read_document": return `读取《${DOC_NAMES[a.type] || a.type}》`;
    case "query_knowledge_base": return `在你的资料里检索:${a.query || ""}`;
    case "web_search": return `联网搜索:${a.query || ""}`;
    case "get_progress_stats": return "查看各知识点进度";
    case "get_exam_info": return "查看考试信息";
    case "list_materials": return "查看资料库";
    case "list_mistakes": return "查看错题";
    case "list_notes": return "查看笔记";
    case "list_knowledge_points": return "查看知识点";
    case "read_overall_profile": return "读取你的整体画像";
    case "get_profile": return "读取个人档案";
    case "refresh_daily_plan": return "刷新今日任务";
    case "set_daily_plan": return "自定义今日任务";
    case "add_knowledge_point": return `新增知识点「${a.title || ""}」`;
    default: return name;
  }
}
function addStep(runId, kind, detail) {
  try {
    const row = db.prepare("SELECT steps_json FROM chat_runs WHERE id=?").get(runId);
    const steps = row?.steps_json ? JSON.parse(row.steps_json) : [];
    steps.push({ kind, detail: detail || "", ts: Date.now() });
    db.prepare("UPDATE chat_runs SET steps_json=?, updated_at=datetime('now') WHERE id=?").run(JSON.stringify(steps.slice(-50)), runId);
  } catch {}
}

// 执行一轮/继续一轮 agent 循环。写步骤、写结果;遇到需确认的写操作则置为 pending 并停下。
export async function runLoop(runId, contents, exam, user, toolNotes = [], planText = "") {
  let system = systemPrompt(exam, user);
  if (planText) system += "\n\n【本次任务的执行计划(主人已同意)】请严格按此顺序推进,做完一步再下一步;涉及删除/清空/重排/重建等改动务必遵守计划里写明的保留策略,该弹确认的工具照常弹:\n" + planText;
  try {
    try {
      const mp = materialParts(exam.id, { max: 3, maxBytes: 12 * 1024 * 1024 });
      if (mp.length) { const lu = [...contents].reverse().find((c) => c.role === "user" && Array.isArray(c.parts)); if (lu && !lu.parts.some((p) => p.inlineData)) lu.parts = [...lu.parts, ...mp]; }
    } catch {}
    for (let i = 0; i < 12; i++) {
      addStep(runId, "think", "");
      const response = await generate(null, { contents, system, tools: [{ functionDeclarations: declsFor(user) }] });
      const calls = response.functionCalls;
      if (!calls || !calls.length) {
        const reply = response.text || "(没有生成回复,请重试)";
        db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(chatKey(exam, user), "model", reply);
        db.prepare("UPDATE chat_runs SET status='done', reply=?, updated_at=datetime('now') WHERE id=?").run(reply, runId);
        addStep(runId, "done", "");
        return;
      }
      const modelContent = response.candidates?.[0]?.content || { role: "model", parts: calls.map((fc) => ({ functionCall: fc })) };
      contents.push(modelContent);
      if (calls.some((c) => isWrite(c.name))) {
        const token = crypto.randomBytes(16).toString("hex");
        const actions = calls.map((c, idx) => isWrite(c.name) ? { idx, tool: c.name, desc: describe(c.name, c.args || {}) } : null).filter(Boolean);
        db.prepare("UPDATE chat_runs SET status='pending', pending_kind='write', token=?, actions_json=?, pending_contents_json=?, pending_calls_json=?, updated_at=datetime('now') WHERE id=?")
          .run(token, JSON.stringify(actions), JSON.stringify(contents), JSON.stringify(calls.map((c) => ({ name: c.name, args: c.args || {} }))), runId);
        addStep(runId, "pending", "");
        try { pushUser(user.id, { title: "\u{1F510} \u9700\u8981\u4f60\u786e\u8ba4", body: "\u6740\u624b\u60f3\u505a\u4e00\u4e2a\u6539\u52a8,\u7b49\u4f60\u5728 App \u91cc\u786e\u8ba4", url: "/chat" }).catch(() => {}); } catch {}
        return;
      }
      const parts = [];
      for (const fc of calls) {
        addStep(runId, "tool", toolLabel(fc.name, fc.args || {}));
        const result = await execTool(fc.name, fc.args || {}, exam, user);
        if (result?.note) { toolNotes.push(result.note); addStep(runId, "result", result.note); }
        parts.push({ functionResponse: { name: fc.name, response: { result } } });
      }
      contents.push({ role: "user", parts });
    }
    const reply = "(处理步数过多,已停止)";
    db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(chatKey(exam, user), "model", reply);
    db.prepare("UPDATE chat_runs SET status='done', reply=?, updated_at=datetime('now') WHERE id=?").run(reply, runId);
    addStep(runId, "done", "");
  } catch (e) {
    try { db.prepare("UPDATE chat_runs SET status='error', reply=?, updated_at=datetime('now') WHERE id=?").run("(出错了,请重试)", runId); } catch {}
    addStep(runId, "error", "");
  }
}

// 计划门:复杂/动系统的请求先出计划并【暂停等主人同意/调整】;简单请求直接执行。
export async function agentLoop(runId, contents, exam, user, toolNotes = []) {
  try {
    const lu = [...contents].reverse().find((c) => c.role === "user" && Array.isArray(c.parts));
    const ask = lu ? lu.parts.map((p) => p.text).filter(Boolean).join(" ") : "";
    if (maybeComplex(ask)) {
      addStep(runId, "think", "");
      const plan = await makePlan(ask, user, {});
      if (plan && plan.complex && Array.isArray(plan.steps) && plan.steps.length) {
        const planObj = { summary: plan.summary || "", steps: plan.steps.slice(0, 8) };
        const token = crypto.randomBytes(16).toString("hex");
        addStep(runId, "plan", JSON.stringify(planObj));
        db.prepare("UPDATE chat_runs SET status='pending', pending_kind='plan', token=?, plan_json=?, ask_text=?, pending_contents_json=?, updated_at=datetime('now') WHERE id=?")
          .run(token, JSON.stringify(planObj), ask, JSON.stringify(contents), runId);
        try { pushUser(user.id, { title: "\u{1F4CB} \u8ba1\u5212\u5f85\u786e\u8ba4", body: "\u6740\u624b\u62df\u597d\u4e86\u4e00\u4efd\u8ba1\u5212,\u7b49\u4f60\u540c\u610f\u6216\u8c03\u6574", url: "/chat" }).catch(() => {}); } catch {}
        return;
      }
    }
  } catch {}
  await runLoop(runId, contents, exam, user, toolNotes, "");
}

// 主人同意计划 -> 按计划开工
export function resumePlanApprove(run, exam, user) {
  const contents = JSON.parse(run.pending_contents_json || "[]");
  let planText = "";
  try { const p = JSON.parse(run.plan_json || "{}"); planText = (p.steps || []).map((s, i) => `${i + 1}. ${s.title}${s.detail ? " — " + s.detail : ""}`).join("\n"); } catch {}
  db.prepare("UPDATE chat_runs SET status='running', token=NULL, plan_json=NULL, ask_text=NULL, pending_kind=NULL, pending_contents_json=NULL, updated_at=datetime('now') WHERE id=?").run(run.id);
  Promise.resolve().then(() => runLoop(run.id, contents, exam, user, [], planText)).catch(() => { try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(run.id); } catch {} });
}

// 主人对计划提意见 -> 后台重规划,再暂停等确认
export function resumePlanRevise(run, exam, user, feedback) {
  db.prepare("UPDATE chat_runs SET status='running', token=NULL, updated_at=datetime('now') WHERE id=?").run(run.id);
  Promise.resolve().then(async () => {
    const ask = run.ask_text || "";
    let prev = {}; try { prev = JSON.parse(run.plan_json || "{}"); } catch {}
    addStep(run.id, "think", "");
    const plan = await makePlan(ask, user, { prevPlan: prev, feedback: feedback || "" });
    const ps = (plan && Array.isArray(plan.steps) && plan.steps.length) ? plan.steps.slice(0, 8) : (prev.steps || []);
    const planObj = { summary: (plan && plan.summary) || prev.summary || "", steps: ps };
    const token = crypto.randomBytes(16).toString("hex");
    addStep(run.id, "plan", JSON.stringify(planObj));
    db.prepare("UPDATE chat_runs SET status='pending', pending_kind='plan', token=?, plan_json=?, updated_at=datetime('now') WHERE id=?").run(token, JSON.stringify(planObj), run.id);
    try { pushUser(user.id, { title: "\u{1F4CB} \u8ba1\u5212\u5df2\u66f4\u65b0", body: "\u6740\u624b\u6309\u4f60\u7684\u610f\u89c1\u6539\u4e86\u8ba1\u5212,\u518d\u770b\u770b", url: "/chat" }).catch(() => {}); } catch {}
  }).catch(() => { try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(run.id); } catch {} });
}

// 创建一个后台运行(fire-and-forget),返回 runId。contents 已由调用方构建好。
export function startRun(exam, user, contents) {
  const ins = db.prepare("INSERT INTO chat_runs(exam_id,user_id,status,steps_json) VALUES(?,?,?,?)").run(chatKey(exam, user), user.id, "running", "[]");
  const runId = ins.lastInsertRowid;
  Promise.resolve().then(() => agentLoop(runId, contents, exam, user, [])).catch(() => { try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(runId); } catch {} });
  return runId;
}
