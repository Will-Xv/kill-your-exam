// 栏目注册表(数据驱动)——第二阶段的地基,第三阶段杀手可往里加"自定义项"。
// 每个 item 是纯数据:id/label(多语言 key)/icon/desc/href(或后续的 action)/badge(徽标来源 key)/
// stat(大模块里那条实时数字的 key)/native(是否有专用富模块渲染器,如排行榜/今日任务)。
// 说明:label/desc 用中文原文作为多语言 key(项目里 t() 以中文为 key)。

// 有专用渲染器的"原生模块"(已存在的富组件)。渲染时用它们本体,不套通用卡片。
export const NATIVE_ITEMS = [
  { id: "leaderboard", label: "排行榜", icon: "🏆", desc: "谁做题最多", native: true, href: "/leaderboard" },
  { id: "hero",        label: "考试信息", icon: "🎯", desc: "当前考试与倒计时", native: true, moduleOnly: true },
  { id: "today",       label: "今日任务", icon: "📋", desc: "今天该做什么", native: true, moduleOnly: true },
  { id: "strategy",    label: "备考建议", icon: "🧠", desc: "AI 给的策略", native: true, moduleOnly: true }
];

// "只有按钮"的功能项 —— 放进分区时用 Style-A 通用富模块渲染。
// badge/stat 指向 lib/uilab/stats.js 里的数据源 key。
export const FEATURE_ITEMS = [
  { id: "home",         label: "首页",         icon: "🏠", desc: "回到首页",            href: "/", pinned: "nav" },
  { id: "exams",        label: "追杀计划",     icon: "🗂️", desc: "你的考试列表",        href: "/exams" },
  { id: "materials",    label: "补充资料",     icon: "📎", desc: "上传/管理复习资料",     href: "/materials" },
  { id: "study",        label: "学习",         icon: "📖", desc: "跟 AI 学知识点 + 练习", href: "/study" },
  { id: "mock",         label: "模拟考",       icon: "📝", desc: "限时全真模拟",          href: "/mock" },
  { id: "prep",         label: "屠杀准备",     icon: "🎒", desc: "考务/应试自测",         href: "/prep" },
  { id: "mistakes",     label: "错题本",       icon: "📕", desc: "重练做错的题",          href: "/mistakes", stat: "mistakesDue" },
  { id: "notes",        label: "笔记本",       icon: "📓", desc: "收藏的题+随手笔记",     href: "/notes" },
  { id: "performances", label: "表演回放",     icon: "🎬", desc: "回看录像+AI点评,可重做", href: "/performances" },
  { id: "arena",        label: "竞技场",       icon: "🎮", desc: "错题Boss战/庭审/辩论赛", href: "/arena" },
  { id: "tasks",        label: "实践任务",     icon: "🛠️", desc: "编程/实验:动手做+判分", href: "/tasks" },
  { id: "quizupload",   label: "上传做题",     icon: "📤", desc: "传题目文件,识别后就地做,记掌握度", href: "/upload-quiz" },
  { id: "inbox",        label: "收件箱",       icon: "📬", desc: "更新公告与信件",        href: "/inbox", badge: "inboxUnread", stat: "inboxUnread" },
  { id: "profile",      label: "你的全部杀技", icon: "🧭", desc: "跨考试的你",            href: "/profile" },
  { id: "checkpoints",  label: "回档",         icon: "↩️", desc: "撤销结构类大改",        href: "/checkpoints" },
  { id: "settings",     label: "设置",         icon: "⚙️", desc: "语言 / 档案 / 导出",     href: "/settings" },
  { id: "feedback",     label: "意见反馈",     icon: "✉️", desc: "给开发者反馈",          href: "/feedback" }
];

// 仅管理员/开发者可见的项(渲染时按 me 过滤)。
export const RESTRICTED_ITEMS = [
  { id: "admin", label: "管理面板",   icon: "📈", desc: "使用情况/子账号", href: "/admin", requires: "isAdmin" },
  { id: "dev",   label: "开发者工具", icon: "🛠️", desc: "调试",           href: "/dev",   requires: "isDeveloper" },
  { id: "bugs",  label: "Bug 反馈",   icon: "🐞", desc: "用户反馈的问题",   href: "/bugs",  requires: "isAdminOrDev" }
];

const BUILTIN = [...NATIVE_ITEMS, ...FEATURE_ITEMS, ...RESTRICTED_ITEMS];

// 第三阶段:杀手创建的自定义项从服务端注入(此处先留空数组/合并点)。
let customItems = [];
export function setCustomItems(arr) { customItems = Array.isArray(arr) ? arr : []; }

export function allItems() { return [...BUILTIN, ...customItems]; }
export function getItem(id) { return allItems().find((x) => x.id === id) || null; }
export function isNative(id) { const it = getItem(id); return !!(it && it.native); }
export function itemVisibleTo(item, me) {
  if (!item || !item.requires) return true;
  if (item.requires === "isAdmin") return !!me?.isAdmin;
  if (item.requires === "isDeveloper") return !!me?.isDeveloper;
  if (item.requires === "isAdminOrDev") return !!(me?.isAdmin || me?.isDeveloper);
  return true;
}
