import db, { getDocument, upsertDocument, getSetting, getActiveExam } from "@/lib/db";
import { getOverallDoc, setOverallDoc } from "@/lib/overall";
import { generate, generateJson, langInstruction, searchWeb, LANG_NAMES } from "@/lib/gemini";
import { retrieve, ragBlock, indexMaterial, materialParts } from "@/lib/rag";
import { ingestWebImages } from "@/lib/webMedia";
import { locateReference } from "@/lib/materialLocate";
import { buildKnowledgeTree, rebuildKnowledgeTree, generateQuestionsForKp, startRebuild } from "@/lib/generators";
import { findAndStoreListening } from "@/lib/music";
import { APP_GUIDE } from "@/lib/appGuide";
import { FEATURE_ITEMS as _FEATS } from "@/lib/uilab/items";
import { DICTS as _DICTS, ZH_TW as _ZTW, ZH_HK as _ZHK } from "@/lib/translations";
import { toTradTW as _tTW, toTradHK as _tHK } from "@/lib/s2t";
function _navName(lang, k) {
  if (lang === "zh") return k;
  if (lang === "zh-TW") return (_ZTW && _ZTW[k]) || _tTW(k);
  if (lang === "zh-HK") return (_ZHK && _ZHK[k]) || _tHK(k);
  return (_DICTS && _DICTS[lang] && _DICTS[lang][k]) || k;
}
// 按主人界面语言给出各栏目的真实名字,避免杀手照搬功能地图里的中文名(P2-2/5/6/8 根因:它对栏目名的认知是中文的)。
// 每个可摆放栏目【是干什么的】——让杀手按功能(而不是只按名字)决定收放/挪位,别把有用的当没用的删了。
const _FEAT_WHEN = {
  mock: "有正式考试/测验值得限时模考时用得上;纯自学/没考试就用不上", prep: "有正式考试(考务、临场、答题策略)时用得上;没考试用不上",
  performances: "【只对要录像/录音表现的:艺术/表演/口语口试/演讲/音乐/舞蹈/体育技能】才用得上;笔试/做题/编程/数理【用不上】",
  tasks: "【有用户真要做/要交的作业】时用得上——比如用户自己的 assignment/homework/project、或你(杀手)给用户布置的实践作业(作业助手作业、编程/实验/项目任务)。★注意:这【不是】指你随手出给用户练的题(那是刷题/练习,归学习或竞技场),而是【一份份要完成的作业】", quizupload: "几乎所有【有书面题】的考试都用得上(拍照或传题目文件就地做);只有纯表演类用不上",
  arena: "想用玩法(错题Boss战/庭审/辩论)练时用得上", mistakes: "有做错的题要重练时用得上", study: "跟 AI 学知识点+练习,几乎都用得上",
};
function featureCatalog() {
  const rows = (_FEATS || []).filter((it) => it.id && it.label && !it.pinned).map((it) => `${it.id}(${it.label}):${it.desc || ""}${_FEAT_WHEN[it.id] ? "。何时用得上:" + _FEAT_WHEN[it.id] : ""}`);
  return "\n【★各栏目是干什么的(收放/挪位/整理界面时按【功能是否真用得上】判断,别只看名字、更别把有用的当没用的删了)】\n" + rows.join("\n") + "\n";
}
function navNameMap(lang) {
  if (!lang || lang === "zh") return ""; // 中文界面不必注入
  const keys = ["追杀计划", "首页", "补充资料", "问问杀手", "更多", "学习", "本周计划表", "竞技场", "模拟考", "实践作业", "错题本", "设置"];
  const pairs = keys.map((k) => `${k}=「${_navName(lang, k)}」`).join("、");
  return `\n【★这些栏目/页面在主人当前界面上的真实名字(跟主人说话时【只用等号右边这个名字】,别用左边的中文原名、也别中英并列):${pairs}。下面功能地图里写的是中文名,仅供你理解;对主人一律说右边的界面名。】\n`;
}

import { saveChatFile, readChatFile } from "@/lib/files";
import { ingestMaterialBuffer } from "@/lib/materialIngest";
import { pushUser } from "@/lib/notify";
import { buildDocx, buildPdf } from "@/lib/doclib";
import { generateBlueprint, saveBlueprint, getBlueprint } from "@/lib/blueprint";
import crypto from "crypto";
import { listBricks, getBrick, runBrick } from "@/lib/bricks/index";
import { rootExamId, scopeSql, familyScope } from "@/lib/db";
import { memoryDigest, listMemory, forgetFact } from "@/lib/memory";
import { knowledgeStateDigest } from "@/lib/mastery";
// 把建考试时的【AI 认知自评】(它对这门考试知道/不知道什么、风险、还缺哪些关键资料)长期喂进杀手上下文——
// 让它【主动】提醒缺口、在补齐前如实告诫"题/讲解来自记忆、可能不完全贴你的真实考试",而不是建完就忘。
function assessBlock(exam) {
  try {
    const sa = JSON.parse(exam.self_assessment || "null"); if (!sa) return "";
    let cl = []; try { cl = JSON.parse(exam.checklist || "[]"); } catch {}
    const missing = cl.filter((c) => c && c.priority === "must" && !c.done).map((c) => c.item).slice(0, 6);
    const parts = [];
    if (sa.confidence) parts.push("把握度:" + sa.confidence);
    if (sa.uncertain && sa.uncertain.length) parts.push("不确定:" + sa.uncertain.slice(0, 4).join("、"));
    if (sa.unknown && sa.unknown.length) parts.push("仍不知道:" + sa.unknown.slice(0, 3).join("、"));
    if (sa.risks && sa.risks.length) parts.push("风险:" + sa.risks.slice(0, 3).join("、"));
    if (missing.length) parts.push("主人还没补的关键资料:" + missing.join("、"));
    if (!parts.length) return "";
    return `\n【建这门考试时你做的「AI 认知自评」(长期有效,别忘也别只在建考试那次用)——${parts.join(";")}。\n据此:①相关时【主动】提醒主人还缺哪些关键资料(别等他问);②在他补齐前,凡是靠你记忆出的题/讲解,如实带一句"这来自我的记忆、可能不完全贴你的真实考试,补了资料会更准";③他补了对应资料、或某个不确定点已澄清,这条缺口就别再反复念。】\n`;
  } catch { return ""; }
}
import { listFeatures, getFeature, nameOrIconTaken, registerFeature, retireFeature, saveCustomItem, removeCustomItem, renameCustomItem } from "@/lib/uiRegistry";
import { basePlacement, moveFeature, undoExamUi, migrateExamUi, setNavDock, setKillerHome } from "@/lib/uiPlacement";
import { normalizePlacement } from "@/lib/uilab/placementCore";
import { readHomeLayout, setHomeLayout, clearHomeLayout } from "@/lib/uiHomeLayout";
import { crossExamPlan } from "@/lib/planner";
import { saveMode, listModes, setActive as setModeActive, deleteMode, activeModesDigest } from "@/lib/learningModes";
import { listCheckpoints, lastCheckpoint, restore, redoCheckpoint, lastRedoable, addLesson, getLessons, clearCheckpoints } from "@/lib/checkpoint";
import { todayStr } from "@/lib/devtime";
import { setReqUser } from "@/lib/reqctx";

const DOC_TYPES = ["dossier", "strategy", "progress"];
const DOC_NAMES = { dossier: "考试档案", strategy: "备考策略", progress: "进度档案" };

// 写操作(会改变数据),执行前必须经用户许可
// 只有敏感/破坏性/外部动作需要主人点允许;后台会自动发生的修改(改档案/策略/整体画像/出题/用户档案)直接执行
export const WRITE_TOOLS = new Set(["delete_material", "delete_knowledge_point", "clear_questions", "browser_task", "build_knowledge_tree", "rollback", "redo", "clear_checkpoints", "ui_move_item", "ui_undo", "ui_create_feature", "ui_remove_feature", "ui_rename_feature", "ui_migrate_ui", "ui_set_nav_dock", "ui_home_layout_set", "ui_home_layout_off", "ui_set_killer_home", "save_learning_mode", "activate_learning_mode", "delete_learning_mode"]); // web_search_and_ingest 移出:直接执行、不弹允许

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
function declsFor(user) { return [...functionDeclarations.filter((d) => !d.devOnly || user?.is_developer).map(({ devOnly, ...d }) => d), ...brickToolDecls(user)]; }
// 是否写操作(需主人点允许):内置写工具,或 write=true 的砖头
export function isWrite(name) { return WRITE_TOOLS.has(name) || !!getBrick(name)?.write; }
// 计划已获主人同意后,这些【低风险的建作业/建子考试/排期/提醒】类写操作不再逐个重复弹确认(避免 syllabus 批量处理时 N 个相同确认框);删除/清空/重排知识树等破坏性操作仍照弹。
const PLAN_SAFE_WRITES = new Set(["exam_provision", "add_assignment", "update_assignment", "plan_from_syllabus", "add_plan_items", "plan_by_day", "build_study_plan", "set_task_due", "set_reminder", "set_auto_rule", "assign_practical_task"]);
// 无考试时也能用的、与具体考试无关的工具
const NOEXAM_TOOLS = new Set(["web_search", "read_overall_profile", "update_overall_profile", "get_profile", "set_profile", "list_memory", "forget_fact", "ui_read", "list_learning_modes", "save_learning_mode", "activate_learning_mode", "delete_learning_mode", "plan_overview"]);
// 聊天归属键:有考试用家族根;无考试用 -用户id 作为该用户的“无考试对话”哨兵键
function chatKey(exam, user) { return -Number(user.id); }   // 【统一聊天】一个用户所有考试共用同一条聊天记录(记忆仍按考试分开,见 route 的 extractMemoryBg)

export const functionDeclarations = [
  { name: "read_document", description: "读取三份核心文档之一:dossier(考试档案)/strategy(备考策略)/progress(进度档案)", parameters: { type: "object", properties: { type: { type: "string", enum: DOC_TYPES } }, required: ["type"] } },
  { name: "update_document", description: "用新的完整 Markdown 覆盖某份核心文档。改前先 read_document。", parameters: { type: "object", properties: { type: { type: "string", enum: DOC_TYPES }, content: { type: "string" } }, required: ["type", "content"] } },
  { name: "query_knowledge_base", description: "在考生资料库中检索(RAG)", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "web_search", description: "联网搜索公开信息", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "get_progress_stats", description: "各知识点练习次数/正确率 + 讨论沉淀的观察" },
  { name: "get_exam_info", description: "当前考试的名称/日期/类型/学校/补充说明" },
  { name: "list_materials", description: "列出资料库里的资料" },
  { name: "locate_material", description: "教材定位:主人给的复习指导若是「教材第X页第Y题 / p.42 ex.3 / 第五章习题5」这类【指向教材某处】的引用,用它在主人上传的资料里把对应内容找出来。返回命中的原文片段+出处(文件名/标题)、语义相近段落、以及图片类资料清单(它们的文字不在索引里,你要用多模态亲自看)。status: found/partial/not_found。【找不到或只是 partial 就如实告诉主人,绝不编造某页的题目内容】。", parameters: { type: "object", properties: { reference: { type: "string", description: "原样传入主人给的引用,如「教材第42页第3题」或「Chapter5 ex.2」" } }, required: ["reference"] } },
  { name: "list_mistakes", description: "列出最近的错题" },
  { name: "list_notes", description: "用户笔记本里的笔记(收藏的题笔记 + 自由笔记),可读" },
  { name: "read_overall_profile", description: "读取用户的整体画像(跨所有考试的长期档案)" },
  { name: "list_memory", description: "读取你对主人的长期记忆条目(本考试 + 全局,含 id/权重/时间/立场)。主人问『你到底记住了我哪些』时用。" },
  { name: "ui_read", description: "读取当前界面定制状态:①【你(杀手)自己现在在哪】(常驻侧栏/浮动气泡/导航栏等,分电脑手机)②导航条位置③首页分区布局④各功能放在导航栏/更多/更多功能/大模块/隐藏的哪处⑤全部功能注册表(含已退役名称,查重用)。要改 UI 或回答「我现在在哪/布局怎样」前【必须先读它】,别凭空臆想界面长什么样。" },
  { name: "ui_move_item", description: "把一个功能移到某处(nav 导航栏 / more 更多菜单 / morefeatures 更多功能 / zone 首页大模块 / hidden 隐藏)。默认【电脑和手机一致】;只想改一端就传 breakpoint。改前先 ui_read;非必要不改、拿不准先问主人。按考试保存、留还原点、可 ui_undo 撤销。", parameters: { type: "object", properties: { featureId: { type: "string" }, where: { type: "string", enum: ["nav", "more", "morefeatures", "zone", "hidden"] }, breakpoint: { type: "string", enum: ["desktop", "mobile"], description: "省略=电脑和手机都改" }, index: { type: "integer", description: "在目标容器里的位置(省略=末尾)" } }, required: ["featureId", "where"] } },
  { name: "ui_undo", description: "撤销本考试【最近一次】界面改动(还原到改动前)。" },
  { name: "ui_create_feature", description: "新建一个功能(可放置的栏目)。id 用英文短横线(如 exam-sprint);name 显示名;icon 一个 emoji;href 点击后去的页面路径(如 /practice);desc 一句话说明。【名称和图标不得与任何现有或曾用(含已删)功能重复】,撞了会被拒绝并告诉你占用者。默认放到 hidden,再用 ui_move_item 摆位。", parameters: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, icon: { type: "string" }, href: { type: "string" }, desc: { type: "string" }, where: { type: "string", enum: ["nav", "more", "morefeatures", "zone", "hidden"] } }, required: ["id", "name", "icon", "href"] } },
  { name: "ui_remove_feature", description: "移除(退役)一个功能:从界面拿掉,名称/图标仍保留占用(可恢复)。传 featureId。", parameters: { type: "object", properties: { featureId: { type: "string" } }, required: ["featureId"] } },
  { name: "ui_rename_feature", description: "给【自定义】功能改名/换图标(内置功能暂不支持改名)。新名称/图标若与任何现有或曾用功能重复会被拒绝并告知占用者。传 featureId + name?/icon?。", parameters: { type: "object", properties: { featureId: { type: "string" }, name: { type: "string" }, icon: { type: "string" } }, required: ["featureId"] } },
  { name: "ui_migrate_ui", description: "把另一门考试(fromExamId)的整套功能放置表迁移(复制)到当前考试。", parameters: { type: "object", properties: { fromExamId: { type: "integer" } }, required: ["fromExamId"] } },
  { name: "ui_set_nav_dock", description: "把导航栏停靠到某条边(top 顶部 / bottom 底部 / left 左侧竖排 / right 右侧竖排)。默认电脑和手机一致;只想改一端就传 breakpoint。这是【布局改动】,拿不准针对哪个平台就先问主人(见第6条规则)。可 ui_undo 撤销。", parameters: { type: "object", properties: { edge: { type: "string", enum: ["top", "bottom", "left", "right"] }, breakpoint: { type: "string", enum: ["desktop", "mobile"], description: "省略=电脑和手机都改" } }, required: ["edge"] } },
  { name: "ui_home_layout_read", description: "读当前首页布局:用了哪个模板、杀手占哪一格(位置),以及所有可选模板和它们的格子位置。要改首页布局前先读它。" },
  { name: "ui_home_layout_set", description: "设置本考试的首页布局:选一个模板并把【杀手】放到某一格,从而把杀手在首页移到 左/右/上/下/某个角。其余格子自动填充首页内容。模板:single 整页 / lr 左右 / tb 上下 / quad 四格 / lsplit_r 左分上下·右整条 / l_rsplit 左整条·右分上下 / t_bsplit 上分左右·下整条 / tfull_bsplit 上整条·下分左右。killerZone 取 a/b/c/d(先用 ui_home_layout_read 看每个模板有哪些格、分别是什么位置)。【杀手必须占一格,绝不能隐藏】。可 ui_undo 撤销。", parameters: { type: "object", properties: { template: { type: "string", enum: ["single", "lr", "tb", "quad", "lsplit_r", "l_rsplit", "t_bsplit", "tfull_bsplit"] }, killerZone: { type: "string", enum: ["a", "b", "c", "d"] } }, required: ["template", "killerZone"] } },
  { name: "ui_home_layout_off", description: "取消本考试的自定义首页布局,回到默认(杀手回到右侧常驻/手机浮动,依然可见)。可 ui_undo 撤销。" },
  { name: "ui_set_killer_home", description: "设置你自己(杀手)的显示形态:dock=占大格/常驻大面板(电脑右侧常驻或首页布局里的某一格),float=像手机一样浮动(一个 💬 圆按钮,点开是全屏抽屉)。你只有这两态。注意:电脑端如果首页是【整列(single)】布局,会自动变成浮动(没有侧栏空间)。【你绝不能把自己隐藏或移除;float 只是浮动,不是隐藏】。默认电脑手机一致,只改一端传 breakpoint。可 ui_undo 撤销。", parameters: { type: "object", properties: { mode: { type: "string", enum: ["dock", "float"] }, breakpoint: { type: "string", enum: ["desktop", "mobile"] } }, required: ["mode"] } },
  { name: "forget_fact", description: "忘掉某一条长期记忆(软删除,可随时恢复)。主人明确要你忘掉某件事时用;先 list_memory 拿到 factId 再调。", parameters: { type: "object", properties: { factId: { type: "integer" } }, required: ["factId"] } },
  { name: "save_learning_mode", description: "保存/更新一个【命名学习模式或配方】——把主人用大白话定的学习规则,存成一条可复用、可激活的规则集。name=模式名(如「冲刺模式」「苏格拉底模式」「先做题后讲」);【绝不能把「用现有工具做不到或超出本产品范围」的事存成模式或触发器——不管是读脑电波等本产品没有的感知/硬件能力,还是挂号/订票/发邮件等替他在现实世界办事,都属假能力/超范围,起草阶段就该拒绝;确有真替代(如作答用时/粗心猜对懂但慢标记/连错/解释质量/distrust_self)才用真替代,没有就老实说做不到】。rules=这套模式下你要遵守的规则,写清楚、可执行(例如:先5分钟讲概念→10分钟做题→5分钟复盘;数学类先给题、错了再反推概念;多用类比、少让我背)。scope=exam(只本考试)或 global(全局·你的全部杀技,所有考试通用)——【主人没明说是只这门考试还是以后所有考试长期通用时,先用大白话问清楚再存,别默认猜】。activate=是否立即生效。生效后这套规则进入你的系统认知,你要一直遵守直到被停用。主人要你『记住以后怎么教/怎么排计划』时,就用它存成模式,而不是只答应一次。若规则里含【自动触发】,【除了 rules 里写清楚,还要在 triggers 里给出结构化触发器】,系统才会在真实做题/打开应用时确定性地自动执行。所有阈值都是参数、按主人说的数字填(引擎通用不写死)。\n【event=answer(做题后)】when 可选:consecutive_wrong(连错,配 n)、consecutive_correct(连对,配 n)、kp_consecutive_wrong(在【同一知识点】上连错,配 n)、accuracy_below(近期正确率过低,配 window=看最近几题、pct=低于百分之几)、mastery_below(当前知识点掌握度低于某档,配 level=weak|ok|mastered)、every(每 n 题一次,配 n)、wrong_after_claim(近期自称懂了/掌握了、却把验证题做错,配 days=往前看几天,默认3)。\n【event=session(打开应用时,每日/每周级)】when 可选:daily_first(每天第一次)、weekly(每周某天,配 day=0~6,0=周日)、due_reviews_at_least(到期该复习的题≥n,配 n)、idle_days(已 n 天没做题,配 n)。\n【action 通用】:difficulty_down/difficulty_up(升降难度,可配 step)、difficulty_min/difficulty_max(锁最易/最难)、note(记一条观察,可配 text)、flag_review(把当前知识点标记为需重点复习)、insert_review(把当前题排进复习队列、尽快再考)、notify(发提醒:站内信一定发,若主人开了通知还会推送到应用外,配 title/text)、distrust_self(下调对主人自评的信任权重、转为验证优先——用于「说懂了但做错」的情形)。", parameters: { type: "object", properties: { name: { type: "string" }, rules: { type: "string" }, scope: { type: "string", enum: ["exam", "global"] }, activate: { type: "boolean" }, triggers: { type: "array", description: "结构化自动触发器(可选)。例:{event:\"answer\", when:\"kp_consecutive_wrong\", n:3, action:\"flag_review\"};{event:\"answer\", when:\"accuracy_below\", window:10, pct:60, action:\"difficulty_down\"};{event:\"session\", when:\"weekly\", day:0, action:\"notify\", title:\"每周回顾\", text:\"...\"};{event:\"session\", when:\"due_reviews_at_least\", n:5, action:\"notify\", text:\"你有该复习的题了\"}。", items: { type: "object", properties: { event: { type: "string", enum: ["answer", "session"] }, when: { type: "string", enum: ["consecutive_wrong", "consecutive_correct", "kp_consecutive_wrong", "accuracy_below", "mastery_below", "every", "wrong_after_claim", "daily_first", "weekly", "due_reviews_at_least", "idle_days"] }, n: { type: "integer" }, window: { type: "integer" }, pct: { type: "number" }, step: { type: "integer" }, level: { type: "string", enum: ["weak", "ok", "mastered"] }, day: { type: "integer" }, days: { type: "integer" }, action: { type: "string", enum: ["difficulty_down", "difficulty_up", "difficulty_min", "difficulty_max", "note", "flag_review", "insert_review", "notify", "distrust_self"] }, title: { type: "string" }, text: { type: "string" } } } } }, required: ["name", "rules"] } },
  { name: "list_learning_modes", description: "列出主人所有学习模式/配方(全局+本考试)及是否已激活。改或引用模式前先读它。" },
  { name: "ask_user_form", description: "【在对话里弹出一个参数表单让主人填】——需要主人提供【几项具体参数】才能继续做某件事时用它(任何场景通用:排计划、建考试的偏好、设置某个规则的阈值、收集背景信息等)。它会像确认框一样【内嵌在聊天里】显示一个表单,主人填完提交,你就在【下一步】拿到这些值继续。★计划/参数类信息【优先用它一次问全,别在对话里一条条来回问】。只填【真正需要、且你还不知道】的字段,别把已知的也塞进来。title=表单标题(一句话说要收集什么);fields=字段数组,每个字段:key(英文标识)、label(给主人看的问题)、type(text文本/number数字/date日期/select下拉/radio单选/checkbox多选)、options(select/radio/checkbox 的选项数组,每项 {value,label})、default(默认值)、placeholder(提示)、required(是否必填)。", parameters: { type: "object", properties: { title: { type: "string" }, fields: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, type: { type: "string", enum: ["text", "number", "date", "select", "radio", "checkbox"] }, options: { type: "array", items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" } } } }, default: { type: "string" }, placeholder: { type: "string" }, required: { type: "boolean" } }, required: ["key", "label", "type"] } } }, required: ["title", "fields"] } },
  { name: "open_plan_setup", description: "【打开「排学习计划」弹窗让主人填参数】当主人要你【排/重排一份学习进程时间表】(按考试日期/学多久/学到哪天,或没时间要求),而你还没拿到这些参数时用本工具:它会在主人屏幕上弹出计划设置弹窗,让主人在里面选好【时间要求、每天能学多久、排哪些天(如跳过周末)】,填完点生成就把学习进程排进「本周计划表」,主人再在那里改或同意。★计划类的参数【走这个弹窗问,不要在对话里一条条追问】。你只管调用它,并在回复里告诉主人「我给你打开了计划设置,填好就行」。", parameters: { type: "object", properties: {} } },
  { name: "plan_overview", description: "跨考试规划总览:把主人【所有考试】按 紧迫度(考试日期)×提分空间(薄弱/未学)×遗忘(到期复习)算优先级,给出每门考试建议今天投入多少分钟,以及【今天最该做的一件事】。主人问『今天该学什么/最该做什么』『我几门考试时间怎么分』『帮我做个总 dashboard』时用。可传 minutes=今天总可用分钟、mode=sprint(临考冲刺,给近考期考试再加权)。", parameters: { type: "object", properties: { minutes: { type: "integer" }, mode: { type: "string", enum: ["normal", "sprint"] } } } },
  { name: "activate_learning_mode", description: "激活或停用一个已保存的学习模式(按名字)。active=true 激活、false 停用。主人说『进入冲刺模式』就激活对应模式;说『退出/切回长期模式』就停用旧的、激活新的。", parameters: { type: "object", properties: { name: { type: "string" }, active: { type: "boolean" } }, required: ["name", "active"] } },
  { name: "delete_learning_mode", description: "删除一个学习模式(按名字)。", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "get_profile", description: "读取考生个人档案(如学校信息)" },
  { name: "list_knowledge_points", description: "列出所有知识点(章→点)及资料覆盖" },
  { name: "web_search_and_ingest", description: "联网搜索某主题并把综合资料存进资料库", parameters: { type: "object", properties: { query: { type: "string" }, title: { type: "string" } }, required: ["query", "title"] } },
  { name: "save_attachment_as_material", description: "把主人【在聊天里发过来的文件】存进【本考试资料库】(走完整入库流程:保存原件、抽文本入检索、按新资料补知识点、重算掌握度、后台做主题匹配标记)。存进去后以后出题/讲解就能检索到、Materials 页也看得到,不再是看一眼就丢。【什么时候用】主人在聊天里发了文件并且(明说或同意)要把它留存进资料库时。可选 filename=只存指定的那个(名字关键词匹配);不填=把主人最近发的、还没存过的都存。【存之前先问一句主人要不要存,除非主人已明确说要存】。", parameters: { type: "object", properties: { filename: { type: "string", description: "只存名字含这个关键词的那份;不填=最近发的都存" } } } },
  { name: "clear_checkpoints", description: "清空主人的全部回档存档点(后悔药历史)。主人明确要求清理时才用;会弹确认。" },
  { name: "list_checkpoints", description: "列出最近的结构性操作检查点(重建/合并知识树、跨考试复制、挂父、开汇总等),含 id、操作、说明、时间、是否已撤销。用于回答“我做过哪些可撤销的改动”或找到要回档的目标。" },
  { name: "redo", description: "重做:把一次【已经撤销(回档)】的结构性操作再应用回去(主人说「重做」「恢复刚才撤销的」「redo」「又想要回来了」时用)。省略 checkpointId=重做【最近一次撤销】的操作。撤销和重做可反复来回。会弹确认。", parameters: { type: "object", properties: { checkpointId: { type: "integer", description: "要重做的检查点 id;省略=最近一次撤销的" } } } },
  { name: "rollback", description: "回档:把某次结构性操作还原到它执行前的状态。省略 checkpointId=撤销【最近一次】未撤销的操作(“撤销刚才那次”)。破坏性还原(会覆盖当前状态),会弹确认。dueTo:这次撤销的原因——bug=发现了问题/AI 做错了(此时【必须】在 lesson 里用一句话写下教训,会记入长期教训库、避免重犯);preference=主人只是改主意/换需求(【不要】写 lesson、不吸取教训);other=其它。", parameters: { type: "object", properties: { checkpointId: { type: "integer", description: "要回档到的检查点 id;省略=最近一次" }, dueTo: { type: "string", enum: ["bug", "preference", "other"], description: "撤销原因" }, lesson: { type: "string", description: "仅当 dueTo=bug 时填:教训一句话" } } } },
  { name: "build_knowledge_tree", description: "重新生成整个知识点树(会删掉现有知识点重建,属于危险操作,会弹确认)。默认 retain=keep(把旧记录按语义迁移到新知识点、最稳);【发起时不必为 retain 单独盘问】,确认框里会写明保留策略、主人可当场否决。可选 retain:keep=迁移旧记录(默认);summarize=把旧表现浓缩成观察、清掉原始做题记录;none=清掉记录与观察干净重来(题库保留)。只有主人【明确】说要清掉旧记录时才用 summarize/none。", parameters: { type: "object", properties: { retain: { type: "string", enum: ["keep", "summarize", "none"] }, timeBudgetMin: { type: "number", description: "【只有】当主人【明确说出一个很短的时间预算、要复习某一小块】时才传(如\"想一小时内复习完这几节\")。传了会把内容压成一个以考试名命名的单章并精简篇幅。【绝不能从范围词或考试名(整门课/期中/期末/某考试)去反推时间预算】——那属于正常多章重建,别传本参数。" }, emphasis: { type: "string", description: "本次侧重(只围绕它展开,可选)" } } } },
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
  { name: "set_daily_plan", description: "【精确设定】今天的今日任务:kpTitles=要练的知识点标题列表,freeTarget=自由练习目标题数,includeReview=是否含错题复习(默认含)。仅当主人【明确点名要哪几个知识点】时用;若只是给个需求(如 今天多练X / 只有30分钟 / 少排点 / 按我的情况重排),用 customize_daily_plan 砖头(它用当前规划逻辑+自我审视智能定制)。", parameters: { type: "object", properties: { kpTitles: { type: "array", items: { type: "string" } }, freeTarget: { type: "integer" }, includeReview: { type: "boolean" } } } },
  { name: "clear_questions", description: "清空题库题目,用于换语言/换题型/风格不对后重出题。范围务必按用户意图选,避免误删记录:【安全默认】all 省略或 false —— 只删【还没做过】的题,做过的题与作答/成绩记录全部保留;【危险】all=true —— 连做过的题及其作答/成绩记录一起【永久删除、不可恢复】,只有用户明确说\"连做过的/包括记录/全部彻底删\"时才用。【部分删除】填 kpTitle 只清某一个知识点下的题(可与 all 组合);不填 kpTitle 就是整门考试。不确定用户要不要删做过的记录时,默认用安全模式(不删记录),或先问清楚。", parameters: { type: "object", properties: { kpTitle: { type: "string", description: "只清这个知识点下的题(部分删除);省略=整门考试" }, all: { type: "boolean", description: "true=连做过的题和作答/成绩记录一起永久删(危险);省略/false=只删没做过的、保留记录(安全)" } } } }
];

// 给用户看的写操作确认文案
export function describe(name, args) {
  switch (name) {
    case "update_document": return `更新《${DOC_NAMES[args.type] || args.type}》`;
    case "web_search_and_ingest": return `联网搜索并把资料「${args.title}」存进资料库`;
    case "save_attachment_as_material": return `把你发的文件${args.filename ? "「" + args.filename + "」" : ""}存进本考试资料库`;
    case "build_knowledge_tree": { const mm = { keep: "你已有的做题记录和掌握度会用【语义迁移】挂到新知识点上(不会丢)", summarize: "把旧表现浓缩成一句观察挂到新知识点、清掉原始做题记录", none: "清空做题记录与观察、干净重来(题库保留)" }[args.retain || "keep"]; return `【按新结构重排整棵知识树】重建知识点;${mm}。\n👉 如果你其实只想【保留现在这棵树、另外补上还没有的新内容】而不重排,请【取消】并对我说“只加新章节”,我改用增量方式,不动你现有的结构和进度。`; }
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
    case "redo": return args.checkpointId ? `重做检查点 #${args.checkpointId}(恢复到撤销前)` : `重做最近一次撤销的结构操作`;
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
    case "locate_material": { return await locateReference(exam.id, args.reference || ""); }
    case "list_materials": { const m = db.prepare("SELECT id, filename, kind, status, auto, offtopic, offtopic_reason FROM materials WHERE exam_id=? ORDER BY id DESC").all(exam.id); return { materials: m.map((x) => `[${x.id}] ${x.filename} (${x.kind},${x.status})${x.auto ? " [系统自动配乐,非用户上传]" : ""}${x.offtopic === 1 ? " ⚠️[疑似与本考试主题不符:" + (x.offtopic_reason || "") + "]" : x.offtopic === 2 ? " ❓[不确定是否属于本考试,需向主人确认:" + (x.offtopic_reason || "") + "]" : x.offtopic === 3 ? " 📚[范围超出本考试,需向主人确认哪部分相关:" + (x.offtopic_reason || "") + "]" : ""}`).join("\n") || "(资料库为空)" }; }
    case "list_mistakes": { const rows = db.prepare(`SELECT q.body, kp.title kt FROM questions q LEFT JOIN knowledge_points kp ON kp.id=q.kp_id JOIN attempts a ON a.id=(SELECT id FROM attempts WHERE question_id=q.id ORDER BY id DESC LIMIT 1) WHERE q.exam_id=? AND q.flagged=0 AND a.correct=0 ORDER BY a.id DESC LIMIT 20`).all(exam.id); return { mistakes: rows.map((r) => `${r.kt || ""}: ${JSON.parse(r.body).stem.slice(0, 50)}`).join("\n") || "(暂无错题)" }; }
    case "read_overall_profile": return { profile: getOverallDoc(user) || "(整体画像还是空的)" };
    case "list_memory": { const rows = listMemory(user.id, {}); return { memory: rows.map((r) => `[${r.id}] ${r.scope || "global"}·${r.subject}:${r.claim}(权重${r.recency}${r.valence ? "·" + r.valence : ""})`).join("\n") || "(还没有对你的长期记忆)" }; }
    case "save_learning_mode": { if ((args.scope || "exam") === "exam" && !exam) return { ok: false, note: "「本考试」模式需要先选一个考试;要通用就把 scope 设为 global" }; const rm = saveMode(user.id, exam ? exam.id : null, args.name, args.rules, { scope: args.scope || "exam", activate: args.activate !== false, triggers: Array.isArray(args.triggers) ? args.triggers : null }); return rm ? { ok: true, note: `已${rm.updated ? "更新" : "保存"}学习模式「${rm.name}」(${rm.scope === "global" ? "全局" : "本考试"})${rm.active ? ",已激活并生效" : ",已保存但未激活"}` } : { ok: false, note: "缺少模式名" }; }
    case "open_plan_setup": { return { ok: true, planSetup: { examDate: (exam && exam.exam_date) || "" }, uiHint: "planSetupOpened" }; }
    case "plan_overview": { const p = crossExamPlan(user.id, { totalMinutes: args.minutes, mode: args.mode }); return { plan: p.exams.map((e) => `${e.name}:${e.daysLeft == null ? "考期未定" : e.daysLeft + "天后考"}、掌握${e.kpTotal ? Math.round((e.mastered / e.kpTotal) * 100) : 0}%、薄弱${e.weak}个、待复习${e.due}题 → 建议今天${e.allocMinutes}分钟`).join("\n") || "(还没有考试)", topTask: p.topTask ? p.topTask.text : null, totalMinutes: p.totalMinutes, examCount: p.examCount }; }
    case "list_learning_modes": { const ms = listModes(user.id, exam ? exam.id : null); return { modes: ms.map((m) => `「${m.name}」[${m.scope === "global" ? "全局" : "本考试"}]${m.active ? " ✅已激活" : " ⭘未激活"}:${(m.rules || "").slice(0, 140)}${m.triggers ? "\n  触发器:" + m.triggers : ""}`).join("\n") || "(还没有任何学习模式)" }; }
    case "activate_learning_mode": { const okm = setModeActive(user.id, exam ? exam.id : null, args.name, args.active); return okm ? { ok: true, note: `模式「${args.name}」已${args.active ? "激活" : "停用"}` } : { ok: false, note: "找不到该模式(先 list_learning_modes 看看名字)" }; }
    case "delete_learning_mode": { const okd = deleteMode(user.id, exam ? exam.id : null, args.name); return okd ? { ok: true, note: `已删除模式「${args.name}」` } : { ok: false, note: "找不到该模式" }; }
    case "forget_fact": { const ok = forgetFact(user.id, args.factId); return { ok, note: ok ? "已忘掉这条(软删除,可恢复)" : "找不到这条记忆" }; }
    case "ui_read": {
      const feats = listFeatures();
      const labels = { nav: "导航栏", more: "更多菜单", morefeatures: "更多功能", zone: "首页大模块", hidden: "隐藏" };
      let placeStr = "(无考试上下文)", killerLoc = "", navLoc = "", homeLoc = "";
      if (exam) {
        let pl = basePlacement(exam.id);
        // 和客户端渲染一致:把没显式摆放的功能补到默认位置(否则 ui_read 报的原始存储会和实际界面对不上)
        try { let globalPl = null; try { globalPl = JSON.parse(getSetting("ui_item_placement", "") || "null"); } catch {} const ids = feats.map((x) => x.feature_id).filter(Boolean); pl = normalizePlacement(pl, ids, globalPl) || pl; } catch {}
        placeStr = Object.entries(labels).map(([w, l]) => `${l}: ${(pl.desktop || []).filter((e) => e.where === w).map((e) => e.item).join("、") || "(空)"}`).join("\n");
        const KH = { dock: "常驻侧栏(电脑=右侧固定一列,手机=底部)", float: "浮动气泡(平时收起、点开才展开)", nav: "放在导航栏", more: "放在更多菜单", morefeatures: "放在更多功能网格", zone: "作为首页的一个大模块(分区里)" };
        const ND = { top: "顶部横排", bottom: "底部横排", left: "左侧竖排", right: "右侧竖排" };
        const kh = pl.killerHome || { desktop: "dock", mobile: "dock" };
        const nd = pl.navDock || { desktop: "top", mobile: "bottom" };
        killerLoc = `你(杀手)现在在:电脑端=${KH[kh.desktop] || kh.desktop};手机端=${KH[kh.mobile] || kh.mobile}`;
        navLoc = `导航条:电脑端=${ND[nd.desktop] || nd.desktop};手机端=${ND[nd.mobile] || nd.mobile}`;
        try { const h = readHomeLayout(exam.id); homeLoc = h && h.applied ? `首页分区布局:模板 ${h.template},你占在「${h.killerPos || h.killerZone}」格` : "首页分区布局:默认(没有自定义分区;首页就是今日任务等内容 + 你在旁边)"; } catch {}
      }
      return { killer: killerLoc, nav: navLoc, homeLayout: homeLoc, placement: placeStr, features: feats.map((x) => `${x.icon} ${x.name} [${x.feature_id}]${x.active ? "" : " (已退役,名称/图标仍占用)"}`).join("\n") };
    }
    case "ui_move_item": {
      if (!["nav", "more", "morefeatures", "zone", "hidden"].includes(args.where)) return { ok: false, note: "where 不合法" };
      moveFeature(exam.id, user.id, { featureId: args.featureId, where: args.where, breakpoint: args.breakpoint, index: args.index });
      return { ok: true, note: `已把「${args.featureId}」移到 ${args.where}${args.breakpoint ? "(" + args.breakpoint + ")" : "(电脑和手机一致)"};已按本考试保存、可 ui_undo 撤销` };
    }
    case "ui_undo": { const sm = undoExamUi(exam.id); return sm ? { ok: true, note: `已撤销界面改动:${sm}` } : { ok: false, note: "本考试没有可撤销的界面改动" }; }
    case "ui_create_feature": {
      const id = String(args.id || "").trim(); if (!id) return { ok: false, note: "缺少 id" };
      if (getFeature(id)) return { ok: false, note: `功能 id「${id}」已存在,换一个` };
      const tk = nameOrIconTaken(args.name, args.icon);
      if (tk.nameTaken) return { ok: false, note: `名称「${args.name}」已被功能「${tk.nameTaken.feature_id}」占用${tk.nameTaken.active ? "" : "(已退役,名称仍保留)"},请换一个;若确定弃用旧的,让主人释放它` };
      if (tk.iconTaken) return { ok: false, note: `图标「${args.icon}」已被功能「${tk.iconTaken.feature_id}」占用,请换一个` };
      registerFeature({ feature_id: id, name: args.name, icon: args.icon });
      saveCustomItem({ id, label: args.name, icon: args.icon, desc: args.desc || "", href: args.href });
      if (exam) moveFeature(exam.id, user.id, { featureId: id, where: args.where || "hidden" });
      return { ok: true, note: `已新建功能「${args.icon} ${args.name}」(${id})${exam ? `,放到 ${args.where || "hidden"}` : ""};可 ui_undo 撤销` };
    }
    case "ui_remove_feature": {
      const ftr = getFeature(args.featureId); if (!ftr) return { ok: false, note: "找不到该功能" };
      retireFeature(args.featureId); removeCustomItem(args.featureId);
      if (exam) moveFeature(exam.id, user.id, { featureId: args.featureId, where: "hidden" });
      return { ok: true, note: `已移除功能「${ftr.name}」(名称/图标仍保留占用,可恢复)` };
    }
    case "ui_rename_feature": {
      const ftr = getFeature(args.featureId); if (!ftr) return { ok: false, note: "找不到该功能" };
      if (ftr.kind === "builtin") return { ok: false, note: "内置功能暂不支持改名(它有多语言标签);可隐藏它或新建一个自定义功能替代" };
      if (args.name && args.name !== ftr.name) { const t2 = nameOrIconTaken(args.name, null).nameTaken; if (t2 && t2.feature_id !== args.featureId) return { ok: false, note: `名称「${args.name}」已被「${t2.feature_id}」占用,换不了;主人可要求彻底丢弃那个旧名再改` }; }
      if (args.icon && args.icon !== ftr.icon) { const t3 = nameOrIconTaken(null, args.icon).iconTaken; if (t3 && t3.feature_id !== args.featureId) return { ok: false, note: `图标「${args.icon}」已被「${t3.feature_id}」占用,换不了` }; }
      registerFeature({ feature_id: args.featureId, name: args.name || ftr.name, icon: args.icon || ftr.icon }); renameCustomItem(args.featureId, args.name, args.icon);
      return { ok: true, note: `已改:${args.icon || ftr.icon} ${args.name || ftr.name}` };
    }
    case "ui_migrate_ui": {
      if (!exam) return { ok: false, note: "需要当前考试上下文" };
      const okm = migrateExamUi(args.fromExamId, user.id, exam.id);
      return okm ? { ok: true, note: `已把考试 #${args.fromExamId} 的界面迁移到本考试;可 ui_undo 撤销` } : { ok: false, note: "源考试没有自定义界面放置表" };
    }
    case "ui_set_nav_dock": { const nd = setNavDock(exam.id, user.id, args.edge, args.breakpoint); return nd ? { ok: true, note: `导航栏已停靠到 ${({top:"顶部",bottom:"底部",left:"左侧竖排",right:"右侧竖排"})[args.edge]||args.edge}${args.breakpoint ? "(" + args.breakpoint + ")" : "(电脑+手机)"};可 ui_undo 撤销` } : { ok: false, note: "edge 只能是 top/bottom/left/right" }; }
    case "ui_home_layout_read": return readHomeLayout(exam.id);
    case "ui_home_layout_set": { const r = setHomeLayout(exam.id, user.id, { template: args.template, killerZone: args.killerZone }); return r ? { ok: true, note: `首页布局已设为 ${r.template},杀手放在「${r.killerPos}」(${r.killerZone} 格);可 ui_undo 撤销` } : { ok: false, note: "设置失败" }; }
    case "ui_home_layout_off": { clearHomeLayout(exam.id, user.id); return { ok: true, note: "已取消自定义首页布局,杀手回到默认位置(依然可见);可 ui_undo 撤销" }; }
    case "ui_set_killer_home": { const kh = setKillerHome(exam.id, user.id, args.mode, args.breakpoint); return kh ? { ok: true, note: `杀手已设为 ${({dock:"占大格/常驻",float:"浮动"})[args.mode]||args.mode}${args.breakpoint ? "(" + args.breakpoint + ")" : "(电脑+手机)"};可 ui_undo 撤销` } : { ok: false, note: "mode 只能是 dock/nav/more/morefeatures" }; }
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
      let imgN = 0; try { imgN = await ingestWebImages(exam.id, r.sources, args.title); } catch {} // 联网资料也多模态:抓来源网页里的示意图/图表存成图片资料
      return { ok: true, note: `已联网充实资料:${args.title}(${n} 段${imgN ? `,并抓取 ${imgN} 张相关配图` : ""})` };
    }
    case "save_attachment_as_material": {
      // 取主人最近在本考试聊天里发的、还没存过的附件(30分钟内),按需按文件名筛
      const scope = scopeSql(familyScope(exam.id));
      let rows = db.prepare(`SELECT id, filename, mime FROM chat_files WHERE exam_id IN ${scope} AND source='upload' AND saved_material_id IS NULL AND created_at >= datetime('now','-30 minutes') ORDER BY id DESC LIMIT 8`).all();
      if (args.filename) { const kw = String(args.filename).toLowerCase(); rows = rows.filter((r) => (r.filename || "").toLowerCase().includes(kw)); }
      if (!rows.length) return { ok: false, note: "没找到你最近在聊天里发的、还没存过的文件(只能存最近半小时内发的附件;如果超时了,请重新把文件发一次再让我存)。" };
      const saved = []; const failed = [];
      for (const r of rows) {
        const buf = readChatFile(r.id);
        if (!buf) { failed.push(r.filename); continue; }
        try {
          const res = await ingestMaterialBuffer(exam.id, user, buf, r.filename || "file", r.mime || "");
          try { db.prepare("UPDATE chat_files SET saved_material_id=? WHERE id=?").run(res.materialId, r.id); } catch {}
          saved.push(r.filename || "file");
        } catch (e) { failed.push(r.filename || "file"); }
      }
      if (!saved.length) return { ok: false, note: `存资料失败:${failed.join("、") || "未知原因"},请稍后再试。` };
      return { ok: true, note: `已把${saved.length}份文件存进本考试资料库:${saved.join("、")}${failed.length ? `(${failed.join("、")}没存成)` : ""}。后台正在按新资料补知识点、并检查它们是否跟本考试主题匹配(不符会在资料列表标出来)。` };
    }
    case "build_knowledge_tree": { const mmLabel = { keep: "完全保留旧记录、语义迁移", summarize: "旧表现浓缩为观察", none: "清空旧记录干净重建" }[args.retain || "keep"]; startRebuild(exam, user, args.retain || "keep", { timeBudgetMin: args.timeBudgetMin ? Number(args.timeBudgetMin) : null, emphasis: args.emphasis || "" }); return { ok: true, note: `已在【后台】开始重建知识点树(${mmLabel})——不用干等,通常 1~2 分钟就绪(期间学习页会显示“重建中”),完成后知识树和进度会自动刷新。` }; }
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
    case "refresh_daily_plan": { const today = todayStr(); db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today); return { ok: true, note: "今日任务已刷新(回首页即按最新情况重排)" }; }
    case "set_daily_plan": {
      const today = todayStr();
      const items = [];
      if (args.includeReview !== false) items.push({ type: "review" });
      for (const t of (args.kpTitles || [])) { const kp = db.prepare("SELECT kp.id, kp.title, ch.title chapter FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL AND kp.title LIKE ? LIMIT 1").get(exam.id, `%${t}%`); if (kp) items.push({ type: "kp", kpId: kp.id, title: kp.title, chapter: kp.chapter }); }
      items.push({ type: "free", target: args.freeTarget || 10 });
      db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today);
      db.prepare("INSERT INTO daily_plans(exam_id,date,items_json,completed,custom) VALUES(?,?,?,0,1)").run(exam.id, today, JSON.stringify(items));
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
    case "redo": {
      const target = args.checkpointId ? { id: Number(args.checkpointId) } : lastRedoable(user.id);
      if (!target) return { ok: false, note: "没有可重做的撤销操作" };
      let r; try { r = redoCheckpoint(target.id, user.id); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
      return { ok: true, note: `已重做:恢复了「${r.label || r.op}」(检查点 #${r.id})。相关考试已回到撤销前的状态;还能再撤销。` };
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
  const memory = memoryDigest(user, exam ? exam.id : null); // 开发者账号:本考试+全局两层;其它账号:原全局行为
  const modes = activeModesDigest(user.id, exam ? exam.id : null); // 已激活的学习模式规则(仅开发者账号)
  const lessons = getLessons(user.id, 8);
  if (!exam) {
    return `你是「主人」的私人「杀手」(Ask Killer)。主人【现在还没有任何考试】。称呼主人为「主人」,语气利落、可靠、真诚。回复语言默认用主人界面语言(${LANG_NAMES[user.lang] || "中文"})。
【今天是 ${todayStr()}(主人本地日期,用于换算"今天/明天/下周X"等相对时间)。】
【你现在唯一的任务:通过对话帮主人从零创建一门考试/学习任务。】
- 先弄清楚:主人要考什么/学什么、类型(学校考试 / 职业资格 / 语言考试 / 升学考试 / 其它 / 只学习)、大概什么时候考、有没有资料或特别侧重。缺什么就问什么,别一次问太多。
- 信息够了就用 **exam_provision** 砖头把考试建起来:它会在后台生成知识点树和备考策略、立即返回(不用干等),是否联网搜这门考试的公开信息由你按情况问主人决定(webSearch 参数)。若主人只想先要一个空壳,用 **exam_create**。想先看主人已有哪些考试用 **exam_list**。
- 【工具限制】此时你【只能】用跨考试砖头(exam_provision / exam_create / exam_list 等)和少数与考试无关的工具(联网搜索、读/改整体画像、读/改个人档案)。【不要】调用需要“当前考试”的工具(读文档、出题、看进度、改策略、重建知识树等)——现在没有对象,调了也会被拒。
【诚实铁律】只能汇报工具【实际返回】的结果;没做成就如实说、绝不编造成功;不确定就说不确定。
【先说清再动手】做不到或只能打折扣时,动手前先如实说清、等主人明确指示再执行。
${overallDoc ? "\n【主人的整体画像(跨所有考试的长期档案)】\n" + overallDoc.slice(0, 1200) + "\n" : ""}${memory ? "\n【长期记忆(冲突并存、以最新为主导、可追溯)】\n" + memory + "\n" : ""}${modes ? "\n【当前已激活的学习模式/配方 · 必须严格遵守】\n" + modes + "\n" : ""}${lessons.length ? "\n【过往教训】\n" + lessons.map((l) => "- " + l).join("\n") + "\n" : ""}`;
  }
  return `你是「主人」的私人「杀手」(Ask Killer)——受雇于主人,职责只有一个:帮主人干掉「${exam.name}」这场考试。考试日期:${exam.exam_date || "未定"}。【今天是 ${todayStr()}(主人本地日期)——主人说"今天/明天/后天/下周X/几号"这类相对时间时,用它换算成 YYYY-MM-DD】。主人是有丰富行业经验的成年人。【这条聊天记录是跨主人【所有考试】共用的同一条——里面可能夹着别的考试的对话;你【当前的焦点】是「${exam.name}」,但看到别的考试话题也别困惑,必要时可自然衔接。你对每门考试的【记忆/掌握度/知识点】仍是各自独立的。】称呼考生为「主人」(其它语言用对应的敬称,如英文 Master),语气利落、可靠、带一点杀手的冷静自信,但始终真诚、有用、不油腻。
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
- 【没有对应工具=明确报告做不到·铁律】主人要你做一件事,你就先在【下方工具/砖头列表】里找有没有能做到它的工具:找到就用;【找不到任何能做到它的工具,就当场明确告诉主人"这件事我现在做不到/没有这个功能"】——绝不闷头不吭声、绝不假装做了、也绝不用一个不相干的工具凑数。(例:主人要删某样东西,而列表里没有对应的删除工具,就直说删不了。)
- 【最危险的一类·假能力/超范围·绝对红线·通用】主人要的事若【用你现有的工具根本做不到、或超出本产品的职责范围】——无论是【本产品没有的感知/硬件能力】(读脑电波、眼动/视线、心率/表情/情绪识别、摄像头看走神、外接设备、定位传感器…),还是【现实世界里替他办事】(帮忙挂号、订票、付款、发邮件/短信、打电话、操作别的软件或网站替他办事…),只要现有工具覆盖不了——【一律当场直说做不到,绝不把它包装成"可实现",绝不 save_learning_mode/activate_learning_mode/recipe_save 存或激活成模式/配方/触发器,也绝不生成一个可批准的『去做它』的计划步骤】。【严禁自相矛盾】:不许"正文承认做不到、下面却还留着可一键批准的假步骤"。做法:①【起草阶段就点明】这超出你能做的范围、别硬接;②若本产品里【有能帮上忙的真实替代】就给出来(例:"读脑电波判断走没走神"→改用 答题用时/粗心·猜对·懂但慢标记/连续错误/解释质量/distrust_self);【没有真替代就老实说这不是本产品能做的事】,不要用一个"差不多"的东西顶上去、更不要假装办了。
- 接到任务【先判断可行性】:用现有工具到底能不能做成、能不能做到让主人满意。若【做不到】,或只能【部分做到 / 用打折扣的方式做到】,你【必须在动手之前】就如实告诉主人——哪些能做、哪些做不到、替代方案各有什么取舍——然后【停下来等主人明确说要怎么办】,拿到明确指示后才开始执行。【在此之前不要调用任何写操作、不要开始多步任务。】
- 【严禁】闷头用一个"差不多"的替代做法顶上去再汇报成功;也【严禁】为了显得能干,硬做出一个不符合主人本意的结果。宁可先把话说清、先问。
- 【表达不清或自相矛盾 → 先追问,别猜(尤其是定义学习配方/规划/工作流等复杂需求)】:主人的要求如果【模糊、缺关键信息、或前后矛盾】(如"两天学完但每天只30分钟还不做题""说前三章练习、后三章也练习却又要求方法不同"),【绝不凭猜测生成或执行】。先【具体】指出哪里不清楚/哪里矛盾,给出你的理解和几个可选项,请主人确认;主人还是没说清,就【继续追问】,直到需求清晰、无矛盾,才动手。这远胜于先做出一个跑偏的结果。
- 【结构大改前,必须先用大白话让主人【三选一】·铁律】当主人要重新规划/扩范围/重建,而这门考试(或它所在的家族)【已有进度或已有题】时,【绝不擅自决定、也绝不只弹个重建确认就当问过了】。调用工具【之前】先用大白话让主人选:①【完全保留旧知识和旧题】——不动现有的树和题,只在需要时另外追加新内容(走增量添加);②【建新树+语义映射】——按新结构重排,把旧的知识点掌握度、做题记录、【以及题库里相关的题】都语义迁移/智能挑到新树:单门用 build_knowledge_tree(retain=keep)自动重指题目与记录;跨考试(如把子考试进度并进母考试新树)用现成的 exam_copy_kps→exam_copy_questions(withAttempts 连作答一起搬、会重算遗忘曲线)、只挑薄弱错题用 exam_promote_weak——【别只迁记录不迁题】;③【完全重新来】——清掉旧记录干净重建(retain=none)。选定哪个再调对应工具。每次都要问,别猜。
- 只有当现有工具确实能干净利落地满足主人要求时,才直接按规矩执行(读取类直接做,写入类走确认门)。若一个大目标里有些部分能做、有些做不到,先说清全貌、让主人决定要不要只做能做的那部分,再动手。
- 【你是 concierge、不是选择题机器·别把该你做的决定甩回给主人】凡是【你有足够信息能自己判断】的事(布置哪个作业、今天学哪个知识点、用哪种方法/玩法),就【自己定好、直接安排】(写操作照旧走确认门让主人一键批准),【绝不】丢给主人"从这几个里选一个"——主人多半是巨婴、正因为自己不会才来找你;他要真能自己挑,要你何用。只有两种情况才让主人选:①他【明确说要自己选/要选项】;②这是【只有他本人能回答的偏好/范围/归属问题】(目标分数、当前水平、算不算某考试的子考试、方法只用这门还是通用)。
原则:
1. 讲知识先 query_knowledge_base;资料没有的要说明"这是训练知识,未经资料证实,建议核实"。
2. 你了解本网站全部功能(见下方功能地图),主人问网站怎么用就据此指路。
3. 回复语言默认用主人界面语言(${LANG_NAMES[user.lang] || "中文"});主人换语言就跟随;术语可保留资料原文,其余不混语言。【★工具返回的 note/文字/状态描述是给【你】看的内部信息、常常是中文——【绝不能原样贴给主人】;一律【用主人当前界面语言】把结论重新说一遍。别让工具里的中文原文漏到回复里。】
${overallDoc ? "\n【主人的整体画像(即「你的全部杀技」,跨所有考试的长期档案,据此了解主人)】\n" + overallDoc.slice(0, 1500) + "\n" : ""}${memory ? `
【长期记忆 · 情景+语义(按新近×权重,冲突并存、可追溯)】
${memory}
【怎么用这层记忆】
- 以【当前主导】(最新、权重高)那条为主,但【历史】不作废、可追溯;不要因为有新说法就假装旧事实没发生过。
- 新旧【冲突】时(如“曾自认数学弱”↔“现自称已很强、别推基础题”),【不要简单否定任何一方】:采取折中并【说明依据】。例如:“你以前在数学上偏弱、现在说已经很强了,那我先给中档题验证一下,如果轻松就直接上难题,如何?”
- 主人纠正你时,把纠正当作【新的记忆】(会自动记下),据此更新当前主导,但仍保留旧记录。
- 这些是主人【自己的说法】,不等于客观事实;可与做题数据(掌握度)相互印证,冲突时如实指出、请主人确认。` : ""}${modes ? `\n【当前已激活的学习模式/配方 · 必须严格遵守】\n${modes}\n【说明】这些是主人给你定的学习规则;已激活的要一直照做,直到被停用。规则之间冲突时以更具体的为准、拿不准就问主人。主人说「进入X模式/切回Y模式」就用 activate_learning_mode 切换。
- 【作用域必问】当主人【新定义或修改】一套学习模式/配方,而没有明说它是【只用于当前这门考试】还是【以后所有考试长期通用】时,【先用大白话问清楚再存,绝不默认】(save_learning_mode 的 scope、recipe_save 的 scope 都要基于主人的回答来填)。\n` : ""}${exam ? `\n【知识状态 · 记忆曲线(实时,以做题数据为准;与主人自述冲突时如实指出)】\n${knowledgeStateDigest(exam.id)}\n` : ""}${exam ? assessBlock(exam) : ""}${exam ? `\n【教材定位】\n- 主人给的复习指导若指向教材某处(第X页第Y题 / p.42 ex.3 / 第五章习题5),先用 locate_material 在他上传的资料里找,把找到的原文/题目呈现出来。\n- 图片扫描件的文字不在索引里,locate_material 会把图片资料列出来,你要用多模态亲自看那几张图。\n- status=not_found 或 partial 时【如实说没找到/不确定】,可以问主人是不是这门考试的资料、或让他把那页拍给你;【绝不编造某页的题目内容】。\n- 【资料主题】某份资料被标⚠️(疑似不符,list_materials 会显示)→【别照它出题/讲课/定位】,先如实提醒主人这像是别的科目、建议换对的资料;被标❓(拿不准)→【用它之前先问主人『这份是不是这门考试的资料』】,别默认拿来用;被标📚(范围超出本考试,如只考第一单元却传了整本书)→先问主人【哪些单元/部分算本考试范围】,别把超范围的内容也建进知识树/出题。\n` : ""}${true ? `
【界面定制(你可改本考试界面)· 规则与砖头互斥】
- 你能读/改界面。要动 UI 前【先用 ui_read】看清当前功能与放置,别凭空臆想。可用的界面砖头:ui_read(读)、ui_move_item(把功能移到 导航栏/更多/更多功能/大模块/隐藏)、ui_create_feature(新建功能)、ui_remove_feature(移除/退役)、ui_rename_feature(给自定义功能改名/换图标,内置功能暂不支持改名)、ui_migrate_ui(把别的考试的界面搬过来)、ui_set_nav_dock(把导航栏停到顶部/底部/左侧/右侧竖排)、ui_home_layout_set(首页里把你自己移到左/右/上/下/某个角)、ui_home_layout_off(取消首页布局)、ui_set_killer_home(把你自己设为 占大格 或 浮动)、ui_undo(撤销最近一次)。【你自己(杀手)只有两态:占大格 或 浮动(像手机那样的 💬 圆按钮);电脑整列布局会自动浮动。【绝不能把自己隐藏或移除】——浮动不算隐藏】。这些都是写操作,会让主人点允许。
- 非必要不改 UI;拿不准怎么改就先问主人,别擅自动手。
- 新功能的【名称和图标】不得与【任何现有或曾经存在过(含已删)的功能】重复;撞了要明确告诉主人换一个。主人可要求彻底丢弃某个不再用的旧名以释放它。
- 改栏目分配默认【电脑与手机一致】,主人另有需求再分开;编辑布局前先问清是针对【电脑 / 手机 / 平板】哪个平台。
- UI 每次改动都会留还原点、可回退、也可迁移到别的考试。
- 【砖头互斥·务必想清楚】UI 定制类砖头自成一组,不要和"出题 / 建知识树 / 改策略"等内容类砖头在同一步里混着调用;build_knowledge_tree(重建知识树)没就绪前,不要对空树跑 generate_question_set / exam_promote_weak;任何结构性大改前先留还原点。拿不准两个操作能否同时做,就【分开做或先问主人】,别赌。
` : ""}${lessons.length ? `
【过往教训(你或主人撤销操作后沉淀的,务必记住、别重犯)】
${lessons.map((l) => "- " + l).join("\n")}` : ""}
【新建/关联考试的规矩(用砖头)】
- 主人要新增一门考试(尤其和现有考试有关联,如某门课的小测、期中、期末),用 exam_provision 砖头:它建好考试并在【后台】生成内容,立即返回,你【不要干等】,拿到 examId 就先汇报"已在后台生成,几分钟后就绪",再继续别的事。追杀计划里会显示生成进度。
- 【默认带内容】建考试默认用 **exam_provision**(会生成知识树/蓝图、进度可见);只有主人【明确】说"只要个空壳/占位、内容以后再说"时才用 exam_create。哪怕主人只给了名字(如"Quiz 1"),也优先 exam_provision——可按父课程的主题生成,主人不满意再调整;别一上来全建空壳,那样没有任何可见的生成过程。
- 【依赖判断】能实时汇总的操作不用等内容:把小测挂到母考试下(exam_set_parent)+开汇总(exam_set_aggregate)当场就能接好,小测内容生成完会自动并入。只有真正需要新考试【内容】的步骤(exam_copy_kps / exam_match_kps / exam_promote_weak)才要先用 exam_gen_status 确认 ready,没就绪就先搁着、告诉主人"等它生成好我再接着做",别对空考试硬跑。
- 【新建母考试(在若干已有考试之上)】必须先问主人:旧考试的内容怎么处理?给四个大白话选项——①实时汇总:不搬运,母考试直接把这些考试合起来复习(推荐、最省);②把知识点和掌握情况总结后搬过去(还要再问一句要不要连题一起搬);③只把有价值的题搬过去(只从做错的和还没做过的题里挑);④把全部知识点和题都复制过去。按选择设 carryMode(live/summarize/partial/copy_all)+ carryWithQuestions。别用"映射"这种词,就说"搬过去/合起来复习"。
- 【新建子任务(小测等)】不要默认照搬母考试的全部信息——小测和期末侧重可能不同。先问主人本次的具体情况:考哪些内容/侧重什么、多长时间、要不要单独联网搜这门小测的信息(默认沿用母考试),把这些填进 notes/emphasis/durationMin/webSearch。若主人想按某个时间复习完(如"这次小测不长,我想用一小时复习完全部"),把 timeBudgetMin 设成 60,系统会据此生成一份该时长的紧凑复习计划,并据主人说明灵活调整知识点结构。
【回档(后悔药)· 要能用白话跟主人讲清楚】
- 你对知识树/考试结构做的每一次大改(重建/合并知识树、跨考试复制/语义映射、挂父、开汇总、提拔薄弱)都会【自动存一个还原点】。主人想撤销就用 rollback(省略 id=撤销最近一次);【撤销后又反悔想恢复】用 redo(省略 id=重做最近一次撤销的);撤销↔重做可反复来回;想看有哪些能撤用 list_checkpoints;想清理历史用 clear_checkpoints。
- 用大白话解释这套机制,别用“检查点/快照”这种词:例如“这些大改我都留了‘后悔药’,你随时能让我撤销刚才那次、或更早某次;默认保留最近 40 次改动、最多 60 天,更早的会自动清掉,不占地方。”
- 【吸取教训的边界】只有当撤销是因为【发现了问题 / 你(AI)做错了】时,才在 rollback 里 dueTo=bug 并写一句教训(会长期记住、避免重犯);如果主人只是【改主意、换需求】,dueTo=preference、【不要】写教训——那不是错,不该被当成教训。
${featureCatalog()}${navNameMap(user.lang)}${APP_GUIDE}`;
}

// 跑 agent 循环:读操作直接执行;遇到写操作则挂起等待许可
// 生成一轮 agent 回合;空回合(无工具调用且无文本)多为瞬时或思考耗尽预算 —— 自动重试一次,别直接吐"没有生成回复"。
function meaningfulText(t) { return !!(t && /[A-Za-z0-9\u4e00-\u9fff]/.test(t)); } // 至少含一个 字母/数字/汉字;像 "}}"、纯符号/大括号 的退化回复不算数
async function agentTurn(args) {
  const ok = (r) => (r && ((r.functionCalls && r.functionCalls.length) || meaningfulText(r.text)));
  const a = { ...args, timeoutMs: 90000, tries: 6 }; // 卡死侦测:某次调用 90s 没响应就【立刻换连接重试】,最多 6 次;不是硬砍任务(任务可以很长,靠心跳保活)
  let res = await generate(null, a);
  if (ok(res)) return res;
  await new Promise((r) => setTimeout(r, 700));
  const res2 = await generate(null, a);
  return ok(res2) ? res2 : (res2 || res);
}
function emptyReplyMsg(res) {
  const fr = res?.candidates?.[0]?.finishReason;
  if (fr === "MAX_TOKENS") return "(这次要说的太长、被截断了 —— 你说一声「继续」我接着说,或把问题拆小一点)";
  if (fr === "SAFETY" || fr === "PROHIBITED_CONTENT" || fr === "RECITATION") return "(这次回复被内容策略拦下了,换个说法我再试)";
  return "(没有生成回复,请重试)";
}
export async function runAgent(contents, exam, user, toolNotes) {
  const system = systemPrompt(exam, user);
  // 把资料库图片/音频作为多模态附件塞进最后一条用户消息(仅一次;resume 时已含 inlineData 不再重复)
  try {
    const mp = await materialParts(exam.id, { max: 3 });
    if (mp.length) {
      const lu = [...contents].reverse().find((c) => c.role === "user" && Array.isArray(c.parts));
      if (lu && !lu.parts.some((p) => p.inlineData || p.fileData)) lu.parts = [...lu.parts, ...mp];
    }
  } catch {}
  for (let i = 0; i < 12; i++) {
    const response = await agentTurn({ contents, system, tools: [{ functionDeclarations: declsFor(user) }] });
    const calls = response.functionCalls;
    if (!calls || !calls.length) {
      const reply = meaningfulText(response.text) ? response.text.trim() : emptyReplyMsg(response);
      db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(chatKey(exam, user), "model", reply);
      return { done: true, reply, toolNotes };
    }
    const modelContent = response.candidates?.[0]?.content || { role: "model", parts: calls.map((fc) => ({ functionCall: fc })) };
    contents.push(modelContent);
    if (calls.some((c) => isWrite(c.name))) {
      const token = crypto.randomBytes(16).toString("hex");
      db.prepare("INSERT INTO chat_pending(token,user_id,exam_id,contents_json,calls_json) VALUES(?,?,?,?,?)")
        .run(token, user.id, exam.id, JSON.stringify(contents), JSON.stringify(calls.map((c) => ({ name: c.name, args: c.args || {} }))));
      const actions = calls.map((c, idx) => isWrite(c.name) ? { idx, tool: c.name, desc: confirmDesc(c.name, c.args || {}) } : null).filter(Boolean);
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
  return { done: true, reply: "我这次连着做了不少步、先在这儿停一下——你刚让我做的事可能已经(部分)完成了。你可以看看结果对不对;要是还没做完,跟我说一声「继续」我就接着做。", toolNotes };
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
// 写操作确认文案(可翻译):返回 {t:模板, p:参数}——前端翻译模板再把 {占位} 回填(用户内容如知识点名/文件名原样保留、不翻)。其它沿用 describe() 的中文串。
function confirmDesc(name, a = {}) {
  switch (name) {
    case "build_knowledge_tree": { const _m = {
      keep: "【按新结构重排整棵知识树】重建知识点;你已有的做题记录和掌握度会用语义迁移挂到新知识点上(不会丢)。想只补充新内容而不重排,请取消并说「只加新章节」。",
      summarize: "【按新结构重排整棵知识树】重建知识点;把旧表现浓缩成一句观察挂到新知识点、清掉原始做题记录。想只补充新内容而不重排,请取消并说「只加新章节」。",
      none: "【按新结构重排整棵知识树】重建知识点;清空做题记录与观察、干净重来(题库保留)。想只补充新内容而不重排,请取消并说「只加新章节」。",
    }; return { t: _m[["keep", "summarize", "none"].includes(a.retain) ? a.retain : "keep"] }; }
    case "delete_material": return { t: "删除资料(id={id})", p: { id: a.materialId } };
    case "delete_knowledge_point": return a.title ? { t: "从学习目标里删除知识点「{title}」", p: { title: a.title } } : { t: "从学习目标里删除知识点(id={id})", p: { id: a.id } };
    case "clear_questions": {
      const kp = a.kpTitle;
      if (a.all) return kp ? { t: "⚠️ 永久删除「{kp}」的全部题目(连做过的记录一起删,不可恢复)", p: { kp } } : { t: "⚠️ 永久删除这门考试的全部题目(连做过的记录一起删,不可恢复)" };
      return kp ? { t: "清空「{kp}」里还没做过的题(做过的题和记录都保留)", p: { kp } } : { t: "清空这门考试里还没做过的题(做过的题和记录都保留)" };
    }
    case "rename_knowledge_point": return { t: "把知识点[{id}]改名为「{title}」", p: { id: a.id, title: a.title } };
    case "rollback": return a.checkpointId ? { t: "回档到检查点 #{id}(还原该结构操作前的状态)", p: { id: a.checkpointId } } : { t: "撤销最近一次结构操作(回档到它执行前)" };
    case "redo": return a.checkpointId ? { t: "重做检查点 #{id}(恢复到撤销前)", p: { id: a.checkpointId } } : { t: "重做最近一次撤销的结构操作" };
    case "clear_checkpoints": return { t: "清空全部回档存档点(不可再撤销之前的操作)" };
    case "update_overall_profile": return { t: "更新你的整体画像(跨所有考试的长期档案)" };
    case "set_profile": return { t: "更新你的档案:学校={school}", p: { school: a.school || "" } };
    case "send_file": return { t: "生成文件「{name}」发给你下载", p: { name: a.filename || "file" } };
    case "save_attachment_as_material": return a.filename ? { t: "把你发的文件「{name}」存进本考试资料库", p: { name: a.filename } } : { t: "把你发的文件存进本考试资料库" };
    case "save_learning_mode": return { t: "保存学习模式「{name}」", p: { name: a.name || "" } };
    case "activate_learning_mode": return a.active ? { t: "激活模式「{name}」", p: { name: a.name || "" } } : { t: "停用模式「{name}」", p: { name: a.name || "" } };
    case "delete_learning_mode": return { t: "删除模式「{name}」", p: { name: a.name || "" } };
    case "exam_provision": return { t: "建考试/子任务「{name}」并后台生成内容", p: { name: a.name || "" } };
    case "add_assignment": return { t: "把作业「{name}」建成作业助手作业", p: { name: a.title || "" } };
    case "update_assignment": return { t: "更新作业「{name}」的要求内容", p: { name: a.title || "" } };
    case "plan_from_syllabus": return { t: "按 syllabus 排整学期(排进按天排期)" };
    case "add_plan_items": return { t: "把这些日程加进按天排期" };
    default: { const d = describe(name, a); const b = getBrick(name); if (b && b.title) return { t: b.title }; return d ? d : name; }
  }
}

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
    case "locate_material": return `在资料里定位「${args.reference || ""}」`;
    case "list_mistakes": return "查看错题";
    case "list_notes": return "查看笔记";
    case "list_knowledge_points": return "查看知识点";
    case "read_overall_profile": return "读取你的整体画像";
    case "list_memory": return "读取对你的长期记忆";
    case "save_learning_mode": return `保存学习模式「${args.name || ""}」`;
    case "list_learning_modes": return "查看学习模式";
    case "plan_overview": return "跨考试规划总览";
    case "open_plan_setup": return "打开排学习计划弹窗";
    case "activate_learning_mode": return `${args.active ? "激活" : "停用"}模式「${args.name || ""}」`;
    case "delete_learning_mode": return `删除模式「${args.name || ""}」`;
    case "ui_read": return "读取当前界面定制状态";
    case "ui_move_item": return `把「${args.featureId}」移到 ${args.where}${args.breakpoint ? "(" + args.breakpoint + ")" : "(电脑+手机)"}`;
    case "ui_undo": return "撤销最近一次界面改动";
    case "ui_create_feature": return `新建功能「${args.icon || ""} ${args.name || args.id}」`;
    case "ui_remove_feature": return `移除功能 ${args.featureId}`;
    case "ui_rename_feature": return `给功能 ${args.featureId} 改名/换图标`;
    case "ui_migrate_ui": return `迁移考试 #${args.fromExamId} 的界面到本考试`;
    case "ui_set_nav_dock": return `导航栏停靠到 ${args.edge}${args.breakpoint ? "(" + args.breakpoint + ")" : ""}`;
    case "ui_home_layout_read": return "读首页布局";
    case "ui_home_layout_set": return `设首页布局 ${args.template},杀手@${args.killerZone}`;
    case "ui_home_layout_off": return "取消自定义首页布局";
    case "ui_set_killer_home": return `杀手搬到 ${args.mode}`;
    case "forget_fact": return `忘掉记忆条目 #${args.factId}`;
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
  try { if (user) setReqUser(user.id); } catch {}   // 请求级绑定:让杀手砖头里的日期偏移按当前账号生效
  let system = systemPrompt(exam, user);
  if (planText) system += "\n\n【本次任务的执行计划(主人已同意)】请严格按此顺序推进,做完一步再下一步;涉及删除/清空/重排/重建等改动务必遵守计划里写明的保留策略,该弹确认的工具照常弹:\n" + planText;
  // 心跳:只要本进程还活着(哪怕某次生成很慢/在重试),每 15s 刷新 updated_at,保证【长任务不会被看门狗误判成掉线】。看门狗只在心跳停了(进程崩溃/重启)时才清理孤儿运行。
  const hb = setInterval(() => { try { db.prepare("UPDATE chat_runs SET updated_at=datetime('now') WHERE id=? AND status='running'").run(runId); } catch {} }, 15000);
  try {
    try {
      const mp = await materialParts(exam.id, { max: 3 });
      if (mp.length) { const lu = [...contents].reverse().find((c) => c.role === "user" && Array.isArray(c.parts)); if (lu && !lu.parts.some((p) => p.inlineData || p.fileData)) lu.parts = [...lu.parts, ...mp]; }
    } catch {}
    for (let i = 0; i < 12; i++) {
      addStep(runId, "think", "");
      const response = await agentTurn({ contents, system, tools: [{ functionDeclarations: declsFor(user) }] });
      const calls = response.functionCalls;
      if (!calls || !calls.length) {
        const reply = meaningfulText(response.text) ? response.text.trim() : emptyReplyMsg(response);
        db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(chatKey(exam, user), "model", reply);
        db.prepare("UPDATE chat_runs SET status='done', reply=?, updated_at=datetime('now') WHERE id=?").run(reply, runId);
        addStep(runId, "done", "");
        return;
      }
      const modelContent = response.candidates?.[0]?.content || { role: "model", parts: calls.map((fc) => ({ functionCall: fc })) };
      contents.push(modelContent);
      const _formCall = calls.find((c) => c.name === "ask_user_form");
      if (_formCall) {
        const token = crypto.randomBytes(16).toString("hex");
        db.prepare("UPDATE chat_runs SET status='pending', pending_kind='form', token=?, form_json=?, pending_contents_json=?, pending_calls_json=?, updated_at=datetime('now') WHERE id=?")
          .run(token, JSON.stringify(_formCall.args || {}), JSON.stringify(contents), JSON.stringify(calls.map((c) => ({ name: c.name, args: c.args || {} }))), runId);
        addStep(runId, "pending", "");
        try { pushUser(user.id, { title: "\u{1F4DD} \u9700\u8981\u4f60\u586b\u4e00\u4e0b", body: "\u6740\u624b\u9700\u8981\u51e0\u9879\u4fe1\u606f", url: "/?killer=1" }).catch(() => {}); } catch {}
        return;
      }
      const _needGate = calls.some((c) => isWrite(c.name) && !(planText && PLAN_SAFE_WRITES.has(c.name)));
      if (_needGate) {
        const token = crypto.randomBytes(16).toString("hex");
        const actions = calls.map((c, idx) => isWrite(c.name) ? { idx, tool: c.name, desc: confirmDesc(c.name, c.args || {}) } : null).filter(Boolean);
        db.prepare("UPDATE chat_runs SET status='pending', pending_kind='write', token=?, actions_json=?, pending_contents_json=?, pending_calls_json=?, updated_at=datetime('now') WHERE id=?")
          .run(token, JSON.stringify(actions), JSON.stringify(contents), JSON.stringify(calls.map((c) => ({ name: c.name, args: c.args || {} }))), runId);
        addStep(runId, "pending", "");
        try { pushUser(user.id, { title: "\u{1F510} \u9700\u8981\u4f60\u786e\u8ba4", body: "\u6740\u624b\u60f3\u505a\u4e00\u4e2a\u6539\u52a8,\u7b49\u4f60\u5728 App \u91cc\u786e\u8ba4", url: "/?killer=1" }).catch(() => {}); } catch {}
        return;
      }
      const parts = [];
      for (const fc of calls) {
        addStep(runId, "tool", toolLabel(fc.name, fc.args || {}));
        const result = await execTool(fc.name, fc.args || {}, exam, user);
        if (result?.switchedExamId) { try { exam = getActiveExam(user.id) || exam; } catch {} } // 同一轮里切了考试→后续工具作用于新考试
        if (result?.note) { toolNotes.push(result.note); addStep(runId, "result", result.note); }
        if (result?.planSetup) { try { addStep(runId, "plan_setup", JSON.stringify(result.planSetup)); } catch {} }
        parts.push({ functionResponse: { name: fc.name, response: { result } } });
      }
      contents.push({ role: "user", parts });
    }
    const reply = "我这次连着做了不少步、先在这儿停一下——你刚让我做的事可能已经(部分)完成了。你可以看看结果对不对;要是还没做完,跟我说一声「继续」我就接着做。";
    db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(chatKey(exam, user), "model", reply);
    db.prepare("UPDATE chat_runs SET status='done', reply=?, updated_at=datetime('now') WHERE id=?").run(reply, runId);
    addStep(runId, "done", "");
  } catch (e) {
    const em = String(e?.message || e || "");
    console.error("[chat runLoop] error:", em, e?.stack || "");
    let msg = "(出错了,请重试)";
    if (e?.isAiError || /(429|quota|rate|overload|503|500|UNAVAILABLE|deadline|timeout|ETIMEDOUT|ECONNRESET|abort|fetch failed|network)/i.test(em)) {
      msg = "(AI 这次没接上/连接不太稳,你的进度没丢——直接再发一次刚才的话、或说「继续」就行)";
    }
    try { db.prepare("UPDATE chat_runs SET status='error', reply=?, updated_at=datetime('now') WHERE id=?").run(msg, runId); } catch {}
    addStep(runId, "error", em.slice(0, 160));
  } finally { clearInterval(hb); }
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
        try { pushUser(user.id, { title: "\u{1F4CB} \u8ba1\u5212\u5f85\u786e\u8ba4", body: "\u6740\u624b\u62df\u597d\u4e86\u4e00\u4efd\u8ba1\u5212,\u7b49\u4f60\u540c\u610f\u6216\u8c03\u6574", url: "/?killer=1" }).catch(() => {}); } catch {}
        return;
      }
    }
  } catch {}
  await runLoop(runId, contents, exam, user, toolNotes, "");
}

// 主人提交了对话内参数表单 -> 把填的值作为 ask_user_form 的结果,继续这次运行
export function resumeForm(run, exam, user, values) {
  const contents = JSON.parse(run.pending_contents_json || "[]");
  const calls = JSON.parse(run.pending_calls_json || "[]");
  const claim = db.prepare("UPDATE chat_runs SET status='running', token=NULL, form_json=NULL, pending_kind=NULL, pending_contents_json=NULL, pending_calls_json=NULL, steps_json='[]', updated_at=datetime('now') WHERE id=? AND status='pending'").run(run.id);
  if (!claim.changes) return;
  const parts = calls.map((c) => ({ functionResponse: { name: c.name, response: { result: c.name === "ask_user_form" ? { ok: true, values: values || {} } : { ok: true } } } }));
  contents.push({ role: "user", parts });
  Promise.resolve().then(() => runLoop(run.id, contents, exam, user, [], "")).catch(() => { try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(run.id); } catch {} });
}

// 主人同意计划 -> 按计划开工
export function resumePlanApprove(run, exam, user) {
  const contents = JSON.parse(run.pending_contents_json || "[]");
  let planText = "";
  try { const p = JSON.parse(run.plan_json || "{}"); planText = (p.steps || []).map((s, i) => `${i + 1}. ${s.title}${s.detail ? " — " + s.detail : ""}`).join("\n"); } catch {}
  db.prepare("UPDATE chat_runs SET status='running', token=NULL, plan_json=NULL, ask_text=NULL, pending_kind=NULL, pending_contents_json=NULL, steps_json='[]', updated_at=datetime('now') WHERE id=?").run(run.id);
  Promise.resolve().then(() => runLoop(run.id, contents, exam, user, [], planText)).catch(() => { try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(run.id); } catch {} });
}

// 主人对计划提意见 -> 后台重规划,再暂停等确认
export function resumePlanRevise(run, exam, user, feedback) {
  db.prepare("UPDATE chat_runs SET status='running', token=NULL, steps_json='[]', updated_at=datetime('now') WHERE id=?").run(run.id);
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
    try { pushUser(user.id, { title: "\u{1F4CB} \u8ba1\u5212\u5df2\u66f4\u65b0", body: "\u6740\u624b\u6309\u4f60\u7684\u610f\u89c1\u6539\u4e86\u8ba1\u5212,\u518d\u770b\u770b", url: "/?killer=1" }).catch(() => {}); } catch {}
  }).catch(() => { try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(run.id); } catch {} });
}

// 创建一个后台运行(fire-and-forget),返回 runId。contents 已由调用方构建好。
export function startRun(exam, user, contents) {
  const ins = db.prepare("INSERT INTO chat_runs(exam_id,user_id,status,steps_json) VALUES(?,?,?,?)").run(chatKey(exam, user), user.id, "running", "[]");
  const runId = ins.lastInsertRowid;
  Promise.resolve().then(() => agentLoop(runId, contents, exam, user, [])).catch(() => { try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(runId); } catch {} });
  return runId;
}
