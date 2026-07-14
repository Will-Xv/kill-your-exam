// 实践任务(编程/项目类):AI 把一个主题拆成里程碑;代码里程碑用 Judge0 跑测试用例判分,
// 重型/非代码里程碑走"证据提交 + AI 审阅"。适合"学编程真去写、学大模型真去做实验"这类。
import db, { examScope, scopeSql } from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";
import { runTests } from "@/lib/judge0";

// AI 布置一个实践任务。topic 可空(空则从薄弱点/考试主题取)。
export async function assignTask(user, exam, { topic, kpId } = {}) {
  const subject = topic || exam.name;
  const out = await generateJson(
    `为「${exam.name}」这门${exam.exam_type === "study" ? "学习" : "考试"},围绕主题「${subject}」给学生布置一个【真去动手做】的实践任务(不是选择题/简答,而是要真的写代码或做实验)。
拆成 2~5 个循序渐进的里程碑。每个里程碑:
- title, desc(要做什么、验收标准)
- check: "run"=可运行的代码任务(能用测试用例自动判);"evidence"=没法自动跑的(如训练模型、画图、做实验),靠学生交成果+证据、AI 审阅。
- 若 check=run:给 language(如 python/javascript/cpp)、starter(可选的起始代码骨架)、tests(2~5 个测试用例 {stdin, expected},expected 是标准输出,末尾不要多余空行);测试要能真正区分对错。
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
  const info = db.prepare("INSERT INTO practical_tasks(exam_id,kp_id,user_id,title,brief,language,milestones_json) VALUES(?,?,?,?,?,?,?)")
    .run(exam.id, kpId || null, user.id, out.title || subject, out.brief || "", out.language || "", JSON.stringify(out.milestones || []));
  return { taskId: info.lastInsertRowid, ...out };
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
  return { id: r.id, exam_id: r.exam_id, title: r.title, brief: r.brief, language: r.language, milestones: ms, progress: progMap };
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
  return { status, score, feedback, exec };
}
