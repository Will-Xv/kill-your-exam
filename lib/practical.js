// 实践作业(编程/项目类):AI 把一个主题拆成里程碑;代码里程碑用 Judge0 跑测试用例判分,
// 重型/非代码里程碑走"证据提交 + AI 审阅"。适合"学编程真去写、学大模型真去做实验"这类。
import db, { examScope, scopeSql } from "@/lib/db";
import { generate, generateJson, langInstruction, attachParts, embed, cosine } from "@/lib/gemini";
import { learnerKpContext } from "@/lib/learnerContext";
import { runTests } from "@/lib/judge0";
import { leafKpList, recordCrossKp, invalidateKnowledgeState } from "@/lib/mastery";
import { getSetting, setSetting } from "@/lib/db";
import { moveFeature } from "@/lib/uiPlacement";

// AI 布置一个实践作业。topic 可空(空则从薄弱点/考试主题取)。
async function matchKp(examId, text) {
  const kps = (() => { try { return leafKpList(examId); } catch { return []; } })();
  if (!kps.length) return null;
  const t = String(text || "").toLowerCase();
  // ① 先精确子串(便宜)
  for (const k of kps) { const kt = String(k.title || "").toLowerCase(); if (kt.length >= 2 && (t.includes(kt) || kt.includes(t.slice(0, 24)))) return k.id; }
  // ② embedding 语义就近(≥0.55),不再靠字面
  try {
    const [qv] = await embed([String(text || "").slice(0, 200)]);
    const kv = await embed(kps.map((k) => k.title));
    let best = -1, bi = -1; kv.forEach((v, i) => { const sc = cosine(qv, v); if (sc > best) { best = sc; bi = i; } });
    if (bi >= 0 && best >= 0.55) return kps[bi].id;
  } catch {}
  return null;
}

export async function assignTask(user, exam, { topic, kpId, dueDate } = {}) {
  const subject = topic || exam.name;
  if (!kpId) kpId = await matchKp(exam.id, subject);
  const out = await generateJson(
    `为「${exam.name}」这门${exam.exam_type === "study" ? "学习" : "考试"},围绕主题「${subject}」给学生布置一个【真去动手做】的实践作业(不是选择题/简答,而是要真的写代码或做实验)。
拆成 2~5 个循序渐进的里程碑。每个里程碑:
- title, desc(要做什么、验收标准)
- check: "run"=可运行的代码任务(能用测试用例自动判);"evidence"=没法自动跑的(如训练模型、画图、做实验),靠学生交成果+证据、AI 审阅。
- 若 check=run:给 language(如 python/javascript/cpp)、starter、tests(【3~5 个】测试用例 {stdin, expected})。
  ★输入输出约定铁律(最重要,自相矛盾的题就是坏在这):① 里程碑 desc 里【必须把题目和输入输出格式对学生讲清楚】——先说清这一步要做什么,再用「输入格式:…」「输出格式:…」写死(stdin 有几行/几个数、每行是什么、用什么分隔;stdout 该打印什么、什么格式),并【附一个"示例输入 / 示例输出"】让学生一眼看懂(示例要和某个测试用例一致)。★示例输入若是多行,【必须真的分行、并用 markdown 围栏代码块把示例输入、示例输出各自包起来】(即前后各放一行三个反引号那种代码块、每行输入单独占一行),【绝不能把多行输入挤成一行】——否则学生根本看不懂格式;② 【优先用"固定行数/固定个数"的输入,不要让学生"读到 EOF"】(除非题目本质就是不定长,那也要在 desc 里明说"一直读到 EOF/文件结束");③ starter【必须用该里程碑的 language 给出与约定一致的读取骨架】,学生只填核心逻辑、不用猜怎么读输入——各语言用各自地道写法(Python: input()/sys.stdin.read().split();C++: std::cin/getline;C: scanf/fgets;Java: Scanner/BufferedReader;JavaScript/Node: readline 或 require("fs").readFileSync(0,"utf8");Go: bufio.Scanner 等),【不要只会写 Python】,读法要匹配 language;④ 每个用例的 stdin【必须严格符合上面声明的格式】(行数、分隔、结尾),expected 是正确程序对这个 stdin 打印的确切内容;⑤ 别把"读一行"的题配上"多行无换行"的用例,也别让固定行数的题去依赖 EOF——读法和用例必须自洽。
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
      m.tests = m.tests.filter((tc) => tc && tc.expected != null && String(tc.expected).trim() !== "" && !PLACEHOLDER.test(String(tc.expected)) && String(tc.stdin || "").length <= 400 && String(tc.expected).length <= 400).slice(0, 6)
        .map((tc) => { const sin = String(tc.stdin || ""); return { ...tc, stdin: sin && !sin.endsWith("\n") ? sin + "\n" : sin }; }); // 补结尾换行:很多 input()/readline 无换行就会读到 EOF 报错
      if (!m.tests.length) { m.check = "evidence"; m.evidenceHint = m.evidenceHint || "跑通你的程序,贴出关键输入输出/运行结果作为证据"; }
    }
    return m;
  });
  const finalKp = kpId || (await matchKp(exam.id, out.title || ""));
  const info = db.prepare("INSERT INTO practical_tasks(exam_id,kp_id,user_id,title,brief,language,milestones_json,due_date) VALUES(?,?,?,?,?,?,?,?)")
    .run(exam.id, finalKp || null, user.id, out.title || subject, out.brief || "", out.language || "", JSON.stringify(milestones), dueDate || null);
  return { taskId: info.lastInsertRowid, ...out, milestones };
}

export function listTasks(exam) {
  const scSql = scopeSql(examScope(exam.id));
  const rows = db.prepare(`SELECT id, title, brief, language, milestones_json, created_at, due_date FROM practical_tasks WHERE exam_id IN ${scSql} ORDER BY id DESC`).all();
  return rows.map((r) => {
    let ms = []; try { ms = JSON.parse(r.milestones_json) || []; } catch {}
    const prog = db.prepare("SELECT milestone_idx, status, score FROM task_progress WHERE task_id=?").all(r.id);
    const done = prog.filter((p) => p.status === "passed" || p.status === "reviewed").length;
    return { id: r.id, title: r.title, brief: r.brief, language: r.language, milestoneCount: ms.length, done, created_at: r.created_at, dueDate: r.due_date || null };
  });
}

export function getTask(taskId) {
  const r = db.prepare("SELECT * FROM practical_tasks WHERE id=?").get(taskId);
  if (!r) return null;
  let ms = []; try { ms = JSON.parse(r.milestones_json) || []; } catch {}
  const prog = db.prepare("SELECT milestone_idx, submission, language, status, score, feedback, exec_json FROM task_progress WHERE task_id=?").all(taskId);
  const appeals = {}; try { for (const a of db.prepare("SELECT milestone_idx, test_index, verdict, ai_note FROM task_test_appeals WHERE task_id=?").all(taskId)) { (appeals[a.milestone_idx] = appeals[a.milestone_idx] || {})[a.test_index] = { verdict: a.verdict, note: a.ai_note }; } } catch {}
  const progMap = {}; for (const p of prog) progMap[p.milestone_idx] = { status: p.status, score: p.score, feedback: p.feedback, submission: p.submission, language: p.language, exec: (() => { try { return JSON.parse(p.exec_json || "null"); } catch { return null; } })() };
  return { id: r.id, exam_id: r.exam_id, kp_id: r.kp_id, title: r.title, brief: r.brief, language: r.language, milestones: ms, progress: progMap, appeals };
}

export async function gradeMilestone(user, task, idx, { submission, language, attachments }) {
  const ms = task.milestones[idx];
  if (!ms) throw new Error("milestone not found");
  let status, score = 0, feedback = "", exec = null;
  if (ms.check === "run") {
    const invalid = invalidTestSet(task.id, idx);
    const tests = (ms.tests || []).filter((_, i) => !invalid.has(i));
    const r = await runTests({ source: submission, language: language || ms.language || task.language, tests });
    if (r.notConfigured) return { needKey: true };
    if (!r.ok) return { error: r.error || "run_failed", detail: r.detail };
    exec = r; score = r.total ? Math.round((r.passedCount / r.total) * 100) : 0;
    status = r.allPassed ? "passed" : "failed";
    feedback = r.allPassed ? "全部测试通过 ✓" : `通过 ${r.passedCount}/${r.total} 个测试用例`;
  } else {
    const prompt = `学生在完成实践里程碑「${ms.title}」:${ms.desc}。评分要点:${(ms.rubric || []).join("；") || "完成度、正确性、证据充分性"}。
学生提交的成果/证据(可能含文字 + 图片/文件附件,请一并多模态审阅):\n${String(submission || "").slice(0, 4000)}\n给 0~100 分,并给出简短反馈(做到了什么、还差什么)。证据不足要指出。` + langInstruction(user.lang);
    const schema = { type: "object", properties: { score: { type: "integer" }, feedback: { type: "string" } }, required: ["score", "feedback"] };
    let ap = [];
    try { ap = await attachParts(Array.isArray(attachments) ? attachments.slice(0, 4) : []); } catch {}
    const g = ap.length
      ? await generateJson(prompt, schema, { contents: [{ role: "user", parts: [{ text: prompt }, ...ap] }] })
      : await generateJson(prompt, schema);
    score = Math.max(0, Math.min(100, g.score || 0)); status = "reviewed"; feedback = g.feedback || "";
  }
  db.prepare(`INSERT INTO task_progress(task_id,milestone_idx,user_id,submission,language,status,score,feedback,exec_json)
    VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(task_id,milestone_idx) DO UPDATE SET submission=excluded.submission, language=excluded.language, status=excluded.status, score=excluded.score, feedback=excluded.feedback, exec_json=excluded.exec_json, created_at=datetime('now')`)
    .run(task.id, idx, user.id, String(submission || ""), language || ms.language || task.language || "", status, score, feedback, exec ? JSON.stringify(exec) : null);
  // 回流掌握度:里程碑通过=对该知识点的 understanding,未过=gap(需要有匹配到的知识点)。
  if (task.kp_id) {
    const ok = status === "passed" || (status === "reviewed" && score >= 60);
    try { recordCrossKp(task.exam_id, null, [{ kpId: task.kp_id, kind: ok ? "understanding" : "gap", insight: `实践作业「${task.title}」里程碑「${ms.title}」${ok ? "完成" : "未过"}` }], null); } catch {}
    try { invalidateKnowledgeState(task.exam_id); } catch {}
  }
  // 任务全部里程碑完成→把这个作业的临时聊天记录删掉(观察早已进掌握度、长期保留)。
  try {
    const total = (task.milestones || []).length;
    if (total) {
      const doneN = db.prepare("SELECT COUNT(DISTINCT milestone_idx) n FROM task_progress WHERE task_id=? AND status IN ('passed','reviewed')").get(task.id)?.n || 0;
      if (doneN >= total) clearTaskChat(task.id);
    }
  } catch {}
  return { status, score, feedback, exec };
}

// —— 实践作业里的「做题聊天」:帮主人把这个作业做出来(引导为主、不直接代做),观察进掌握度,任务完成即删记录 ——
export function taskChatHistory(taskId) {
  try { return db.prepare("SELECT role, content FROM task_chat WHERE task_id=? ORDER BY id").all(Number(taskId)); } catch { return []; }
}
export function clearTaskChat(taskId) { try { db.prepare("DELETE FROM task_chat WHERE task_id=?").run(Number(taskId)); } catch {} }

export async function taskChatTurn(user, task, message, live = []) {
  const kpTitle = task.kp_id ? (db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(task.kp_id)?.title || "") : "";
  const msDesc = (task.milestones || []).map((m, i) => {
    const prog = (task.progress || {})[i] || null;
    const lv = (Array.isArray(live) ? live : []).find((x) => x && Number(x.idx) === i) || null;
    let block = `${i + 1}. ${m.title}${m.desc ? " — " + String(m.desc).slice(0, 200) : ""}`;
    if (m.check === "run" && Array.isArray(m.tests) && m.tests.length) {
      block += "\n   测试用例(助教可看,别直接把整份答案代码写给他,只用它引导/帮他调试):" + m.tests.slice(0, 8).map((tc, k) => `\n     用例${k + 1}: 输入=${JSON.stringify(String(tc.stdin ?? tc.input ?? "")).slice(0, 120)} → 期望=${JSON.stringify(String(tc.expected ?? tc.output ?? "")).slice(0, 120)}`).join("");
    }
    if (!prog && lv && (lv.code || (lv.runOut && Array.isArray(lv.runOut.results)))) {
      if (lv.code) block += `\n   他当前的作答(还没提交):\n\`\`\`\n${String(lv.code).slice(0, 1500)}\n\`\`\``;
      const rex = lv.runOut;
      if (rex && Array.isArray(rex.results)) {
        block += `\n   他最近一次【运行】结果(未提交):通过 ${rex.passedCount ?? 0}/${rex.total ?? rex.results.length}` + (rex.allPassed ? "(全过)" : "");
        for (const r of rex.results.filter((r) => !r.passed).slice(0, 5)) block += `\n     ✗ 输入=${JSON.stringify(String(r.stdin ?? "")).slice(0, 100)} → 期望=${JSON.stringify(String(r.expected ?? "")).slice(0, 100)} / 实际=${JSON.stringify(String(r.stdout ?? "")).slice(0, 100)}${r.stderr ? " / 报错=" + String(r.stderr).slice(0, 120) : ""}`;
      }
    }
    if (prog) {
      const curCode = (lv && lv.code) || prog.submission;
      if (curCode) block += `\n   他当前的作答(可能还没提交):\n\`\`\`\n${String(curCode).slice(0, 1500)}\n\`\`\``;
      const ex = (lv && lv.runOut && Array.isArray(lv.runOut.results)) ? lv.runOut : prog.exec;
      if (ex && Array.isArray(ex.results)) {
        block += `\n   最近一次运行结果:通过 ${ex.passedCount ?? 0}/${ex.total ?? ex.results.length}` + (ex.allPassed ? "(全过)" : "");
        const fails = ex.results.filter((r) => !r.passed).slice(0, 5);
        for (const r of fails) block += `\n     ✗ 输入=${JSON.stringify(String(r.stdin ?? "")).slice(0, 100)} → 期望=${JSON.stringify(String(r.expected ?? "")).slice(0, 100)} / 实际=${JSON.stringify(String(r.stdout ?? "")).slice(0, 100)}${r.stderr ? " / 报错=" + String(r.stderr).slice(0, 120) : ""}`;
      } else if (prog.status) {
        block += `\n   状态:${prog.status}${typeof prog.score === "number" ? " · " + prog.score + "分" : ""}${prog.feedback ? " · " + String(prog.feedback).slice(0, 160) : ""}`;
      }
    }
    // 【纯运行程序】的输出/报错 + 他喂的输入(未测、未提交也给助教看)
    if (lv && lv.runOut && !Array.isArray(lv.runOut.results)) {
      const ro = lv.runOut;
      const parts = [];
      if (ro.stdout) parts.push("输出=" + JSON.stringify(String(ro.stdout)).slice(0, 200));
      if (ro.stderr) parts.push("报错=" + String(ro.stderr).slice(0, 200));
      if (ro.compile_output) parts.push("编译错误=" + String(ro.compile_output).slice(0, 200));
      if (ro.error) parts.push("运行出错=" + String(ro.error).slice(0, 200));
      if (ro.status && !parts.length) parts.push("状态=" + String(ro.status));
      if (ro.time) parts.push("耗时=" + ro.time + "s");
      if (parts.length) block += `\n   他刚【运行程序】(未测/未提交)${lv.runInput ? "·输入=" + JSON.stringify(String(lv.runInput)).slice(0, 100) : ""}:` + parts.join(" / ");
    }
    // 有测试用例、但当前没有任何可信的【测试】结果(通过 X/Y)→ 明确告诉助教:别假设过了
    if (m.check === "run" && Array.isArray(m.tests) && m.tests.length && !/通过 \d+\//.test(block)) {
      block += `\n   ⚠️ 还没有可信的测试结果(他还没点【测试】,或结果没传上来)——【不知道过没过,绝不能假设通过】。`;
    }
    return block;
  }).join("\n");
  const LANGN = ["中文", "English", "français", "español", "русский", "العربية", "Bahasa Indonesia"][["zh", "en", "fr", "es", "ru", "ar", "id"].indexOf(user.lang)] || "中文";
  const system = `你是主人的「实践作业助教」,正陪他做这个动手作业。你的目标是【帮他自己把作业做出来、并真正学会所需的知识】,【不是替他把答案/代码整段写好交上去】。
【这个作业】${task.title}${task.brief ? "\n简介:" + String(task.brief).slice(0, 400) : ""}
【里程碑】
${msDesc || "(无)"}
【你能看到什么·重要】上面每个里程碑里,只要他跑过,就已经给了你他的【当前代码、运行输出、报错/编译错误、测试通过 X/Y】——这就是他屏幕上的实时状态,你【看得见】。他问"你看到我的报错了吗""帮我看下运行结果/这个 error"时,【直接引用上面这些信息】帮他定位调试,【绝不要说"我看不到你的运行结果/屏幕/报错"】。只有上面【确实没有】相关信息(或标了"还没有可信的测试结果")时,才让他先点【运行程序】或【测试】跑一次再回来。
【怎么帮】
- 他卡住时:先问清他卡在哪、想到哪一步了,再用【提示/追问/拆小步/给类比/指出思路】把他往前推一步;能让他自己写出来的就别替他写。
- 他要的前置知识【简单】:直接用几句话讲清让他读;【抽象/易误解】:用苏格拉底式反问先确认他真懂,再往下。
- 代码类:可以给【片段/伪代码/调试思路】,但别整段代劳;他贴报错就帮他读错、指方向。
- 【代码题怎么读输入,以测试用例的 stdin 实际格式为准】:上面每个用例的 stdin 就是评测时真正喂进去的输入——教他读法时【数清楚那 stdin 有几行/几个数、用什么分隔、要不要读到 EOF】,照它教,读法要用【他这题的编程语言】的地道写法(固定几行就按行读、不定长才整体读到底;各语言各自的读入方式),【别前后矛盾、也别默认都是 Python】。拿不准就先让他把某个用例的 stdin 贴进【运行程序】的输入框跑一次看实际行为。
- 以事实为准,绝不为迎合把错的说成对的;他跑题(问网站功能/建考试/改界面等)就提醒他去「问问杀手」,你只管这个作业。
- 【铁律·测试结果只能照实说,不准编】你对"过没过 / 通过几个"的一切说法,【只能】来自上面【里程碑】里明确写出的"通过 X/Y"数字:写"通过 0/6"就是【全挂、没过】,你要帮他对照期望/实际/报错看为什么错,【绝对不许】说成"全部通过""6/6 Pass"之类;里程碑里【标了"⚠️ 还没有可信的测试结果"或压根没有结果行】,就说明他【还没跑出可信结果】,你要先让他点【测试】,【绝不能】凭空恭喜他通过。编造/夸大通过情况=最严重的错误,比帮不上还糟。
- 简洁,用${LANGN}回复。
${kpTitle ? `【这位主人在「${kpTitle}」上的历史(他看不到;据此因材施教:别重复他已懂的、优先戳之前的误区)】
${(() => { try { return learnerKpContext(task.kp_id) || "(暂无)"; } catch { return "(暂无)"; } })()}` : ""}
【每次回复最后另起一行,输出本轮从主人【最新这句】看出的知识点掌握信号(他看不到):@@KP [{"id":${task.kp_id || 0},"kind":"understanding"或"misconception"}]。真正说清/答透=understanding;暴露明确概念错误=misconception;只是在提问/看不出就给 @@KP []。】`;
  const hist = taskChatHistory(task.id);
  const contents = hist.map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.content }] }));
  contents.push({ role: "user", parts: [{ text: String(message || "").slice(0, 4000) }] });
  const res = await generate(null, { contents, system });
  let reply = res.text || "(未生成回复)";
  // 逐轮记录:观察进掌握度(和自由探索/竞技场一致,走带权重+近期衰减的 insights)
  const kt = reply.match(/@@KP\s*(\[[\s\S]*?\])/);
  if (kt) {
    let sig = []; try { sig = JSON.parse(kt[1]); } catch {}
    reply = reply.replace(kt[0], "").trim();
    const cross = (Array.isArray(sig) ? sig : []).filter((x) => x && (x.kind === "understanding" || x.kind === "misconception") && Number(x.id) === Number(task.kp_id))
      .map((x) => ({ kpId: Number(x.id), kind: x.kind, insight: x.kind === "understanding" ? `做实践作业「${task.title}」时答透了这个点` : `做实践作业「${task.title}」时暴露出这个点的概念错误` }));
    try { if (cross.length && task.kp_id) { recordCrossKp(task.exam_id, null, cross, null); invalidateKnowledgeState(task.exam_id); } } catch {}
  }
  try {
    db.prepare("INSERT INTO task_chat(task_id,user_id,role,content) VALUES(?,?,?,?)").run(task.id, user.id, "user", String(message || "").slice(0, 4000));
    db.prepare("INSERT INTO task_chat(task_id,user_id,role,content) VALUES(?,?,?,?)").run(task.id, user.id, "assistant", reply);
  } catch {}
  return { reply };
}


export function deleteTask(user, taskId) {
  const r = db.prepare("SELECT user_id, exam_id FROM practical_tasks WHERE id=?").get(Number(taskId));
  if (!r) return false;
  // 归属:任务的创建者,或该考试属于此用户(用 examScope 家族判断由调用方保证 inScope)
  try { db.prepare("DELETE FROM task_progress WHERE task_id=?").run(Number(taskId)); } catch {}
  try { db.prepare("DELETE FROM task_chat WHERE task_id=?").run(Number(taskId)); } catch {}
  db.prepare("DELETE FROM practical_tasks WHERE id=?").run(Number(taskId));
  return true;
}


// 复习自动布置:开关 + 找到下一个未完成里程碑 + 无进行中任务时后台自动生成一个(限流)。
export function getPracticalMode(examId) { try { return getSetting(`practical_mode:${examId}`) === "1"; } catch { return false; } }
export function setPracticalMode(examId, userId, on) {
  try { setSetting(`practical_mode:${examId}`, on ? "1" : "0"); } catch {}
  // 实践作业是编程/实践类专属:开启时才把「实践作业」栏目放进这门考试首页,关闭时隐藏——不默认塞给无关考试。
  try { if (userId) moveFeature(examId, userId, { featureId: "tasks", where: on ? "morefeatures" : "hidden" }); } catch {}
  return !!on;
}

// 首页/今日任务用:把本家族的实践作业当作“子考试样式”的条目列出来(带进度),点它进 /tasks 做题。
// 注意:这【不是】真的考试——不建 exams 行、不进 planner/模拟/资料,所以它不会有自己的学习计划(符合 Will 的设计)。
export function listTaskSubs(examId) {
  const scSql = scopeSql(examScope(examId));
  const rows = db.prepare(`SELECT id, title, milestones_json, due_date FROM practical_tasks WHERE exam_id IN ${scSql} ORDER BY (due_date IS NULL), due_date ASC, id ASC`).all();
  return rows.map((r) => {
    let ms = []; try { ms = JSON.parse(r.milestones_json) || []; } catch {}
    const prog = db.prepare("SELECT milestone_idx, status FROM task_progress WHERE task_id=?").all(r.id);
    const done = new Set(prog.filter((p) => p.status === "passed" || p.status === "reviewed").map((p) => p.milestone_idx)).size;
    return { taskId: r.id, title: r.title, done, total: ms.length, due: r.due_date || null, complete: ms.length > 0 && done >= ms.length };
  });
}

export function nextIncomplete(exam) {
  const scSql = scopeSql(examScope(exam.id));
  const rows = db.prepare(`SELECT id, title, milestones_json FROM practical_tasks WHERE exam_id IN ${scSql} ORDER BY id DESC`).all();
  for (const r of rows) {
    let ms = []; try { ms = JSON.parse(r.milestones_json) || []; } catch {}
    const prog = db.prepare("SELECT milestone_idx, status FROM task_progress WHERE task_id=?").all(r.id);
    const doneSet = new Set(prog.filter((p) => p.status === "passed" || p.status === "reviewed").map((p) => p.milestone_idx));
    for (let i = 0; i < ms.length; i++) { if (!doneSet.has(i)) return { taskId: r.id, title: r.title, idx: i, milestoneTitle: ms[i] && ms[i].title, total: ms.length, doneCount: doneSet.size }; }
  }
  return null;
}

// 若开了实践模式、且当前没有进行中任务 → 后台自动布置一个(30分钟内不重复生成)。返回是否触发了生成。
export function maybeAutoAssign(user, exam) {
  if (!getPracticalMode(exam.id)) return false;
  if (nextIncomplete(exam)) return false;
  const K = `practical_lastgen:${exam.id}`;
  try { const last = Number(getSetting(K) || 0); if (Date.now() - last < 30 * 60 * 1000) return false; setSetting(K, String(Date.now())); } catch {}
  Promise.resolve().then(() => assignTask(user, exam, {})).catch(() => {});
  return true;
}

function invalidTestSet(taskId, idx) {
  const set = new Set();
  try { for (const r of db.prepare("SELECT test_index FROM task_test_appeals WHERE task_id=? AND milestone_idx=? AND verdict='invalid'").all(taskId, idx)) set.add(r.test_index); } catch {}
  return set;
}

// 学生申诉某个测试用例:AI 复核该用例的 expected 是否正确(结合里程碑要求)。判无效则记下,以后判分跳过它。
export async function appealTest(user, task, idx, testIndex, note) {
  const ms = task.milestones[idx];
  if (!ms || ms.check !== "run" || !Array.isArray(ms.tests) || !ms.tests[testIndex]) throw new Error("no such test");
  const tc = ms.tests[testIndex];
  const g = await generateJson(
    `一道编程题的自动判分用例被学生质疑可能有错。请判断这个用例的【标准答案(expected)是否正确】。
里程碑要求:${ms.title} — ${ms.desc}
用例输入(stdin):${String(tc.stdin || "(空)").slice(0, 400)}
该用例标注的标准答案(expected):${String(tc.expected).slice(0, 400)}
${note ? "学生的申诉理由:" + String(note).slice(0, 400) : ""}
请你【独立地】按题目要求算出这个输入应有的正确输出,与 expected 比对。verdict:"valid"=expected 确实正确(申诉不成立);"invalid"=expected 有误(申诉成立,应作废这个用例)。note:一句话说明理由(正确输出应是什么)。以事实/题意为准,不因学生申诉就一味判无效。` + langInstruction(user.lang),
    { type: "object", properties: { verdict: { type: "string", enum: ["valid", "invalid"] }, note: { type: "string" } }, required: ["verdict", "note"] }
  );
  const verdict = g.verdict === "invalid" ? "invalid" : "valid";
  try { db.prepare(`INSERT INTO task_test_appeals(task_id,milestone_idx,test_index,verdict,ai_note) VALUES(?,?,?,?,?)
    ON CONFLICT(task_id,milestone_idx,test_index) DO UPDATE SET verdict=excluded.verdict, ai_note=excluded.ai_note, created_at=datetime('now')`).run(task.id, idx, testIndex, verdict, g.note || ""); } catch {}
  return { verdict, note: g.note || "" };
}
