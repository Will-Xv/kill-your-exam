// 砖头(类14):让杀手开一局游戏化学习(错题Boss战/庭审/辩论赛)并走一个回合。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { arenaTurn, ARENA_MODES } from "@/lib/arena";

registerBrick({
  name: "arena_play", category: "gamify", title: "开一局游戏化学习(Boss战/庭审/辩论)", write: false,
  description: "把复习变成对战:mode=boss(错题变Boss,答对造成伤害)/trial(知识点庭审,考生当辩方)/debate(辩论赛,AI站对面)。scope=weak(薄弱知识点,默认)或wrong(错题)。history=之前的对话轮次(可空,空则开场)。用户说「用Boss战复习错题」「跟我辩论一下」「把这章的概念拉出来审判」等时用。返回这一回合的叙事与状态(meter=血量/优势,done/win)。",
  inputs: [
    { key: "mode", type: "string", required: true, desc: "boss / trial / debate" },
    { key: "scope", type: "string", required: false, desc: "weak(默认) 或 wrong" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const mode = ARENA_MODES[args?.mode] ? args.mode : "boss";
    const r = await arenaTurn(ctx.user, exam, { mode, scope: args?.scope === "wrong" ? "wrong" : "weak", history: Array.isArray(args?.history) ? args.history : [] });
    return { ok: true, mode, reply: r.reply, meter: r.state?.meter, done: !!r.state?.done, win: !!r.state?.win, hint: "要继续这局,把用户回应加进 history 再调一次;或让用户直接去 /arena 页面玩。" };
  },
});
