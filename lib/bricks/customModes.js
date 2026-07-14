// 砖头(C1/B):让杀手为当前考试创建自定义互动模式——游戏化学习玩法 或 自定义考核/考试形式(如苏格拉底答辩、模拟王国)。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { createMode, listModes } from "@/lib/customModes";

registerBrick({
  name: "create_custom_mode", category: "custom_mode", title: "创建自定义玩法/考核形式", write: true,
  description: "为当前考试创建一个自定义互动模式,复用竞技场互动引擎。kind='play'=游戏化学习玩法;kind='exam_form'=自定义考核/考试形式(例:苏格拉底答辩=用户要接住你所有提问并把你问倒才满分;模拟王国=给定国情,用户每个决策影响王国命运,必须按某思想治国才满分)。spec 用大白话写清这个玩法/考核怎么进行、怎么算赢/满分。用户说「给我做一个苏格拉底答辩考核」「设计一个模拟王国的考试」「加个自定义复习玩法」时用。",
  inputs: [
    { key: "kind", type: "string", required: true, desc: "play(玩法) 或 exam_form(考核形式)" },
    { key: "name", type: "string", required: true, desc: "名字,如 苏格拉底答辩" },
    { key: "spec", type: "string", required: true, desc: "大白话规则:怎么进行、怎么算赢/满分" },
    { key: "emoji", type: "string", required: false, desc: "一个表情" },
    { key: "meterLabel", type: "string", required: false, desc: "计分条含义,如 说服力/王国存续度/得分" },
    { key: "winDesc", type: "string", required: false, desc: "达成/满分条件" },
    { key: "meterDir", type: "string", required: false, desc: "up(越高越好,默认) 或 down(越低越好)" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    if (!args || !args.name || !args.spec) throw new Error("缺少 name 或 spec");
    const r = createMode(ctx.user, exam, { kind: args.kind, name: args.name, emoji: args.emoji, spec: args.spec, meterLabel: args.meterLabel, winDesc: args.winDesc, meterDir: args.meterDir });
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
