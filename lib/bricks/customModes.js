// 砖头(C1/B):让杀手为当前考试创建自定义互动模式——游戏化学习玩法 或 自定义考核/考试形式(如苏格拉底答辩、模拟王国)。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { createMode, listModes, generateModes } from "@/lib/customModes";

registerBrick({
  name: "create_custom_mode", category: "custom_mode", title: "创建自定义玩法/考核形式", write: true,
  description: "为当前考试创建一个自定义互动模式,复用竞技场互动引擎。kind='play'=游戏化学习玩法;kind='exam_form'=自定义考核/考试形式(例:苏格拉底答辩=用户要接住你所有提问并把你问倒才满分;模拟王国=给定国情,用户每个决策影响王国命运,必须按某思想治国才满分)。format=video 时是【视频类考核】(考生录一段视频、AI 多模态按 spec 评分,如「知行合一」把理论用到视频里)。spec 用大白话写清这个玩法/考核怎么进行、怎么算赢/满分(视频类就写清要录什么、评分看什么)。用户说「给我做一个苏格拉底答辩考核」「设计一个模拟王国的考试」「做一个知行合一的视频考核」「加个自定义复习玩法」时用。",
  inputs: [
    { key: "kind", type: "string", required: true, desc: "play(玩法) 或 exam_form(考核形式)" },
    { key: "name", type: "string", required: true, desc: "名字,如 苏格拉底答辩。这会成为栏目标题(可能出现在导航栏/首页卡片等窄处),【务必极简短】:≤20 字符/约10个汉字,越短越好,否则放不下、还会撑坏导航栏" },
    { key: "spec", type: "string", required: true, desc: "大白话规则:怎么进行、怎么算赢/满分" },
    { key: "emoji", type: "string", required: false, desc: "一个表情" },
    { key: "meterLabel", type: "string", required: false, desc: "计分条含义,如 说服力/王国存续度/得分" },
    { key: "winDesc", type: "string", required: false, desc: "达成/满分条件,一句话。也会作为栏目副标题说明,务必极短、≤48 字符,别写长段落" },
    { key: "meterDir", type: "string", required: false, desc: "up(越高越好,默认) 或 down(越低越好)" },
    { key: "format", type: "string", required: false, desc: "考核形式:interactive(互动对话,默认) 或 video(视频作答,考生录视频、AI多模态判分)" },
    { key: "where", type: "string", required: false, desc: "这个考核栏目放哪(你决定):nav导航栏/morefeatures首页卡片(默认)/more更多菜单/zone首页大模块/hidden隐藏" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    if (!args || !args.name || !args.spec) throw new Error("缺少 name 或 spec");
    const r = createMode(ctx.user, exam, { kind: args.kind, name: args.name, emoji: args.emoji, spec: args.spec, meterLabel: args.meterLabel, winDesc: args.winDesc, meterDir: args.meterDir, format: args.format, where: args.where });
    return { ok: true, modeId: r.id, kind: args.kind === "exam_form" ? "exam_form" : "play", hint: "用户可到 /arena 页选这个模式开始;custom:" + r.id + " 也可由 arena_play 直接跑。" };
  },
});

registerBrick({
  name: "list_custom_modes", category: "custom_mode", title: "列出自定义玩法/考核", write: false,
  description: "列出当前考试已有的自定义玩法和自定义考核形式。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    return { ok: true, play: listModes(exam, "play").map((m) => m.name), examForms: listModes(exam, "exam_form").map((m) => m.name) };
  },
});


registerBrick({
  name: "generate_custom_modes", category: "custom_mode", title: "让AI创意生成几个考核形式", write: true,
  description: "针对当前考试/学习内容,由 AI【创意生成】若干贴合内容的考核形式(互动答辩/情境模拟/角色扮演/视频应用等),直接入库供选用。用户说「给我出几个庄子的考核」「AI 帮我想几种考法」「自动生成考核形式」时用。count=生成几个(默认3,上限5)。生成的考核【只出现在竞技场(/arena)里供选用,不会自动摆到导航栏/更多功能/更多菜单】(避免刷屏/撑坏导航栏);用户若想把某个挪成首页卡片/导航栏入口,再让杀手用 ui_move_item 挪。名字务必极短。",
  inputs: [{ key: "count", type: "number", required: false, desc: "生成几个,默认3" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const r = await generateModes(ctx.user, exam, { count: args && args.count ? Number(args.count) : 3 });
    return { ok: true, created: (r.created || []).map((m) => `${m.name}(${m.format === "video" ? "视频" : "互动"})`) };
  },
});