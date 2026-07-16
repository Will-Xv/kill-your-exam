// 砖头(H3):让杀手排一个到点提醒——到时会推送通知 + 进收件箱。用户说"明天提醒我复习X""两小时后叫我"等时用。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { addReminder } from "@/lib/reminders";
import db from "@/lib/db";

registerBrick({
  name: "set_reminder", category: "plan", title: "排一个到点提醒", write: true,
  description: "为主人排一个【到点提醒】:到时间会给主人推送通知(若开了通知)并投一封收件箱信。主人说「明天提醒我复习X」「两小时后叫我做题」「周五提醒我做模拟考」时用。给 text(提醒内容)+ 何时:offsetDays/offsetHours(从现在起多少天/小时后)或 dueAt(绝对时间 'YYYY-MM-DD HH:MM')。★注意诚实:推送需要主人先在设置里开启浏览器通知才能在离开时收到;没开的话提醒仍会在收件箱里、主人下次回来就能看到——别夸大成'一定会准时弹窗'。",
  inputs: [
    { key: "text", type: "string", required: true, desc: "提醒内容,如 复习 Lagrange multiplier" },
    { key: "offsetDays", type: "number", required: false, desc: "从现在起几天后(明天=1)" },
    { key: "offsetHours", type: "number", required: false, desc: "从现在起几小时后" },
    { key: "dueAt", type: "string", required: false, desc: "绝对时间 YYYY-MM-DD HH:MM(给了它就忽略 offset)" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!args || !args.text) throw new Error("缺少 text");
    const r = addReminder(ctx.user.id, exam ? exam.id : null, { text: args.text, offsetDays: args.offsetDays, offsetHours: args.offsetHours, dueAt: args.dueAt });
    return { ok: true, reminderId: r.id, dueAt: r.dueAt, note: `已排提醒:「${args.text}」,到点会推送(需已开通知)并进收件箱。` };
  },
});

registerBrick({
  name: "list_reminders", category: "plan", title: "列出未到期的提醒", write: false,
  description: "列出主人还没到期/未投递的提醒。",
  inputs: [],
  run: async (args, ctx) => {
    const rows = db.prepare("SELECT text, due_at FROM reminders WHERE user_id=? AND delivered=0 ORDER BY due_at").all(ctx.user.id);
    return { ok: true, reminders: rows.map((r) => `${r.due_at} — ${r.text}`) };
  },
});
