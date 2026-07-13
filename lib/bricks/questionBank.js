// 砖头:让杀手管理【封闭题库 / 开卷固定题库】。这套设置对【练习】和【模拟考】同时生效——
// 开启封闭题库后,练习和模拟都只从这些题里出、绝不生成新题;练习会从库里随机抽题,
// 模拟考按蓝图组卷(抽多少题、题型结构走 customize_mock_blueprint)。用于「开卷已知全部考题 / 固定100题抽50 / 平时也锁死在这些题里」。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { bankList, bankAdd, bankSetMust, bankDelete, setClosedBank, bankParseText } from "@/lib/questionBank";

const examOf = (ctx) => ctx.exam || getActiveExam(ctx.user.id);

registerBrick({
  name: "bank_list", category: "question_bank", title: "查看题库(用户提供的固定题)+ 是否封闭", write: false,
  description: "列出当前考试【题库】里用户自己提供的固定题(origin=fixed),以及这门考试是否开启了「封闭题库」。用于回答「我的题库里有哪些题/有几道」「现在是不是只从我给的题里出」。返回 closedBank 与题目列表(含是否必出 must)。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = examOf(ctx); if (!exam) throw new Error("没有当前考试");
    return { closedBank: !!exam.closed_bank, count: bankList(exam.id).length, questions: bankList(exam.id).map((q) => ({ id: q.id, qtype: q.qtype, stem: q.stem.slice(0, 80), must: q.must })) };
  },
});

registerBrick({
  name: "bank_set_closed", category: "question_bank", title: "开/关封闭题库(练习+模拟同时生效)", write: true,
  description: "开启或关闭当前考试的「封闭题库(开卷/锁死题库)」。on=true:练习和模拟【都只从用户提供的固定题里出,绝不生成新题】;on=false:恢复正常(题库不够时 AI 补题)。用于主人说「只用我自己的题」「开卷,就考这些题」「把题库锁死」。注意:题库里得先有题,否则开启后没题可出。",
  inputs: [{ key: "on", type: "boolean", required: true, desc: "true=开启封闭题库,false=关闭" }],
  run: async (args, ctx) => {
    const exam = examOf(ctx); if (!exam) throw new Error("没有当前考试");
    setClosedBank(exam.id, !!args.on);
    return { ok: true, examId: exam.id, closedBank: !!args.on, bankCount: bankList(exam.id).length };
  },
});

registerBrick({
  name: "bank_paste", category: "question_bank", title: "整段粘贴已知考题入库(AI 一字不差整理)", write: true,
  description: "把主人给的一整段【已知会考的题】文本原样整理入题库(AI 只做切分与结构化,题干/答案一字不差,不改写不编造)。适合「这是历年真题/老师给的题,全部录进来」。markMust=true 时把这批都标为「必出原题」。返回新增题数。入库后可配合 bank_set_closed 开启封闭题库,让练习和模拟只从这些题出。",
  inputs: [{ key: "text", type: "string", required: true, desc: "整段题目文本(可含题干/选项/答案/解析)" }, { key: "markMust", type: "boolean", required: false, desc: "是否把这批标为必出原题(默认否)" }],
  run: async (args, ctx) => {
    const exam = examOf(ctx); if (!exam) throw new Error("没有当前考试");
    const r = await bankParseText(exam, String(args.text || ""), ctx.user.lang, !!args.markMust);
    return { ok: true, added: r.added || 0, bankCount: bankList(exam.id).length };
  },
});

registerBrick({
  name: "bank_add", category: "question_bank", title: "手动添加一道题库题", write: true,
  description: "往当前考试题库加一道结构化的固定题(按题干去重)。用于主人口述/逐题给一道已知会考的题。qtype: single/multi/judge/fill/short。must=true 标为必出原题。",
  inputs: [
    { key: "stem", type: "string", required: true, desc: "题干" },
    { key: "qtype", type: "string", required: false, desc: "题型 single/multi/judge/fill/short(默认 short)" },
    { key: "options", type: "json", required: false, desc: "选项数组(选择题用)" },
    { key: "answer", type: "string", required: false, desc: "答案" },
    { key: "explanation", type: "string", required: false, desc: "解析(可选)" },
    { key: "must", type: "boolean", required: false, desc: "是否必出原题(默认否)" },
  ],
  run: async (args, ctx) => {
    const exam = examOf(ctx); if (!exam) throw new Error("没有当前考试");
    const id = bankAdd(exam.id, { qtype: args.qtype, stem: args.stem, options: args.options, answer: args.answer, explanation: args.explanation, must: !!args.must });
    if (!id) throw new Error("题干为空,未添加");
    return { ok: true, questionId: id, bankCount: bankList(exam.id).length };
  },
});

registerBrick({
  name: "bank_set_must", category: "question_bank", title: "把某题标为/取消「必出原题」", write: true,
  description: "把题库里的某道题标为「必出原题」(每次模拟考原样置于卷首、一字不差)或取消。questionId 来自 bank_list。",
  inputs: [{ key: "questionId", type: "number", required: true, desc: "题库题 id" }, { key: "on", type: "boolean", required: true, desc: "true=标为必出,false=取消" }],
  run: async (args, ctx) => {
    const exam = examOf(ctx); if (!exam) throw new Error("没有当前考试");
    bankSetMust(exam.id, Number(args.questionId), !!args.on);
    return { ok: true, questionId: Number(args.questionId), must: !!args.on };
  },
});

registerBrick({
  name: "bank_delete", category: "question_bank", title: "从题库删除一道题", write: true,
  description: "从当前考试题库删掉一道用户提供的固定题(只删 origin=fixed 的题,不影响 AI 生成的练习题)。questionId 来自 bank_list。",
  inputs: [{ key: "questionId", type: "number", required: true, desc: "题库题 id" }],
  run: async (args, ctx) => {
    const exam = examOf(ctx); if (!exam) throw new Error("没有当前考试");
    bankDelete(exam.id, Number(args.questionId));
    return { ok: true, deleted: Number(args.questionId), bankCount: bankList(exam.id).length };
  },
});
