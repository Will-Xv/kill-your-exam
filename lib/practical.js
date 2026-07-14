// 实践任务(编程/项目类):AI 把一个主题拆成里程碑;代码里程碑用 Judge0 跑测试用例判分,
// 重型/非代码里程碑走"证据提交 + AI 审阅"。适合"学编程真去写、学大模型真去做实验"这类。
import db, { examScope, scopeSql } from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";
import { runTests } from "@/lib/judge0";
import { leafKpList, recordCrossKp, invalidateKnowledgeState } from "@/lib/mastery";

// AI 布置一个实践任务。topic 可空(空则从薄弱点/考试主题取)。
function matchKp(examId, text) {
  try {
    const t = String(text || "").toLowerCase();
    const kps = leafKpList(examId);
    for (const k of kps) { const kt = String(k.title || "").toLowerCase(); if (kt.length >= 2 && (t.includes(kt) || kt.includes(t.slice(0, 20)))) return k.id; }
  } catch {}
  return null;
}

export async function assignTask(user, exam, { topic, kpId } = {}) {
  const subject = topic || exam.name;
  if (!kpId) kpId = matchKp(exam.id, subject);
  const out = await generateJson(
    `为「${exam.name}」这门${exam.exam_type === "study" ? "学习" : "考试"},围绕主题「${subject}」给学生布置一个【真去动手做】的实践任务(不是选择题/简答,而是要真的写代码或做实验)。
拆成 2~5 个循序渐进的里程碑。每个里程碑:
- title, desc(要做什么、验收标准)
- check: "run"=可运行的代码任务(能用测试用例自动判);"evidence"=没法自动跑的(如训练模型、画图、做实验),靠学生交成果+证据、AI 审阅。
- 若 check=run:给 language(如 python/javascript/cpp)、starter(可选、简短的起始骨架)、tests(【3~5 个】测试用例 {stdin, expected})。
  ★测试用例铁律(务必遵守):① 每个用例的输入要【小】、输出要【短】;② expected 必须是你能【100% 手算正确】的【真实标准输出】(末尾不要多余空行);③ 【严禁占位符】——绝不能把 expected 写成 "Pending"/"TODO"/"?"/"待定"/"N/A"/"见后续" 之类,每个 expected 都必须是正确程序真正会打印的确切内容;④ 【绝对不要】生成几十上百个用例、也不要用会产生超大数字/超长输出的输入(如大数阶乘、大范围循环打印);⑤ 用例数控制在 5 个以内;⑥ 定稿前【在脑中用一个正确参考解逐个跑一遍每个用例】,确认 expected 与参考解输出完全一致;⑦ 只要你无法 100% 确定某个 expected 的正确性,就把这个里程碑改成 check=evidence(让学生交结果+AI审阅),不要硬塞 run 用例。测试要能区分对错但保持简单可验证。
- 若 check=evidence:给 rubric(评分要点数组)、evidenceHint(该交什么证据,如"贴出训练 loss 曲线/最终输出/你的发现")。
整体给 title(任务名)、brief(一段话说明目标)、language(主要语言,没有就空)。任务要具体、可完成、有意义,别空泛。` + langInstruction(user.lang),
    { type: "object", properties: {
      title: { type: "string" }, brief: { type: "string" }, language: { type: "string" },
      milestones: { type: "array", items: { type: "object", properties: {
        title: { type: "string" }, desc: { type: "string" }, check: { type: "string", enum: ["run", "evidence"] },
        language: { type: "string" }, starter: { type: "string" },
        tests: { type: "array", items: { type: "object", properties: { stdin: { type: "string" }, expected: { type: "string" } } } },
        rubric: { type: "array", items: { type: "string" } }, evidenceHint: { type: "string" },
      }, required: ["title", "desc", "check"] } },
    }, required: ["title", "brief", "milestones"] }
  );
  // 防御:限制每个里程碑的测试数量与输入/输出体积(避免模型偶尔生成超大/超多用例)。
  const milestones = (out.milestones || []).slice(0, 6).map((m) => {
    if (m.check === "run" && Array.isArray(m.tests)) {
      const PLACEHOLDER = /^\s*(pending|todo|tbd|n\/?a|placeholder|待定|见后续|\?+|\.\.\.|—|-)\s*$/i;
      m.tests = m.tests.filter((tc) => tc && tc.expected != null && String(tc.expected).trim() !== "" && !PLACEHOLDER.test(String(tc.expected)) && String(tc.stdin || "").length <= 400 && String(tc.expected).length <= 400).slice(0, 6);
      if (!m.tests.length) { m.check = "evidence"; m.evidenceHint = m.evidenceHint || "跑通你的程序,贴出关键输入输出/运行结果作为证据"; }
    }
    return m;
  });
  const finalKp = kpId || matchKp(exam.id, out.title || "");
  const info = db.prepare("INSERT INTO practical_tasks(exam_id,kp_id,user_id,title,brief,language,milestones_json) VALUES(?,?,?,?,?,?,?)")
    .run(exam.id, finalKp || null, user.id, out.title || subject, out.brief || "", out.language || "", JSON.stringify(milestones));
  return { taskId: info.lastInsertRowid, ...out, milestones };
}

export function listTasks(exam) {
  const scSql = scopeSql(examScope(exam.id));
  const rows = db.prepare(`SELECT id, title, brief, language, milestones_json, created_at FROM practical_tasks WHERE exam_id IN ${scSql} ORDER BY id DESC`).all();
  return rows.map((r) => {
    let ms = []; try { ms = JSON.parse(r.milestones_json) || []; } catch {}
    const prog = db.prepare("SELECT milestone_idx, status, score FROM task_progress WHERE task_id=?").all(r.id);
    const done = prog.filter((p) => p.status === "passed" || p.status === "reviewed").length;
    return { id: r.id, title: r.title, brief: r.brief, language: r.language, milestoneCount: ms.length, done, created_at: r.created_at };
  });
}

export function getTask(taskId) {
  const r = db.prepare("SELECT * FROM practical_tasks WHERE id=?").get(taskId);
  if (!r) return null;
  let ms = []; try { ms = JSON.parse(r.milestones_json) || []; } catch {}
  const prog = db.prepare("SELECT milestone_idx, submission, language, status, score, feedback, exec_json FROM task_progress WHERE task_id=?").all(taskId);
  const progMap = {}; for (const p of prog) progMap[p.milestone_idx] = { status: p.status, score: p.score, feedback: p.feedback, submission: p.submission, language: p.language, exec: (() => { try { return JSON.parse(p.exec_json || "null"); } catch { return null; } })() };
  return { id: r.id, exam_id: r.exam_id, kp_id: r.kp_id, title: r.title, brief: r.brief, language: r.language, milestones: ms, progress: progMap };
}

export async function gradeMilestone(user, task, idx, { submission, language }) {
  const ms = task.milestones[idx];
  if (!ms) throw new Error("milestone not found");
  let status, score = 0, feedback = "", exec = null;
  if (ms.check === "run") {
    const r = await runTests({ source: submission, language: language || ms.language || task.language, tests: ms.tests || [] });
    if (r.notConfigured) return { needKey: true };
    if (!r.ok) return { error: r.error || "run_failed", detail: r.detail };
    exec = r; score = r.total ? Math.round((r.passedCount / r.total) * 100) : 0;
    status = r.allPassed ? "passed" : "failed";
    feedback = r.allPassed ? "全部测试通过 ✓" : `通过 ${r.passedCount}/${r.total} 个测试用例`;
  } else {
    const g = await generateJson(
      `学生在完成实践里程碑「${ms.title}」:${ms.desc}。评分要点:${(ms.rubric || []).join("；") || "完成度、正确性、证据充分性"}。
学生提交的成果/证据:\n${String(submission || "").slice(0, 4000)}\n给 0~100 分,并给出简短反馈(做到了什么、还差什么)。证据不足要指出。` + langInstruction(user.lang),
      { type: "object", properties: { score: { type: "integer" }, feedback: { type: "string" } }, required: ["score", "feedback"] }
    );
    score = Math.max(0, Math.min(100, g.score || 0)); status = "reviewed"; feedback = g.feedback || "";
  }
  db.prepare(`INSERT INTO task_progress(task_id,milestone_idx,user_id,submission,language,status,score,feedback,exec_json)
    VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(task_id,milestone_idx) DO UPDATE SET submission=excluded.submission, language=excluded.language, status=excluded.status, score=excluded.score, feedback=excluded.feedback, exec_json=excluded.exec_json, created_at=datetime('now')`)
    .run(task.id, idx, user.id, String(submission || ""), language || ms.language || task.language || "", status, score, feedback, exec ? JSON.stringify(exec) : null);
  // 回流掌握度:里程碑通过=对该知识点的 understanding,未过=gap(需要有匹配到的知识点)。
  if (task.kp_id) {
    const ok = status === "passed" || (status === "reviewed" && score >= 60);
    try { recordCrossKp(task.exam_id, null, [{ kpId: task.kp_id, kind: ok ? "understanding" : "gap", insight: `实践任务「${task.title}」里程碑「${ms.title}」${ok ? "完成" : "未过"}` }], null); } catch {}
    try { invalidateKnowledgeState(task.exam_id); } catch {}
  }
  return { status, score, feedback, exec };
}


export function deleteTask(user, taskId) {
  const r = db.prepare("SELECT user_id, exam_id FROM practical_tasks WHERE id=?").get(Number(taskId));
  if (!r) return false;
  // 归属:任务的创建者,或该考试属于此用户(用 examScope 家族判断由调用方保证 inScope)
  try { db.prepare("DELETE FROM task_progress WHERE task_id=?").run(Number(taskId)); } catch {}
  db.prepare("DELETE FROM practical_tasks WHERE id=?").run(Number(taskId));
  return true;
}