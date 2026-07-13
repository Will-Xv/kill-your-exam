import db, { examScope, scopeSql } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { generateJson, langInstruction } from "@/lib/gemini";
import { masteryMatrix } from "@/lib/mastery";
import { activeModesDigest } from "@/lib/learningModes";
import { aiErrorResponse } from "@/lib/errors";

// 类11:根因诊断——不按错题表面频率,而是找【根因知识点 + 反复错误模式 + 是否逃避最难内容】。
// 先在服务端算好确定性信号(章节正确率、基础/薄弱、疑似回避),再交给模型基于真实数据综合,避免凭空编造。
export async function GET() {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ diagnosis: null, reason: "no_exam" });
    const scSql = scopeSql(examScope(exam.id));

    const matrix = masteryMatrix(exam.id);
    const attempted = matrix.filter((m) => m.attempts > 0);

    // 讨论/追问(苏格拉底式)暴露的理解缺口 —— 即使答对,这里的 gap 也是根因信号。
    const insRows = db.prepare(`SELECT i.kind, i.text, kp.title kp_title, ch.title chapter
      FROM insights i LEFT JOIN knowledge_points kp ON kp.id=i.kp_id LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id
      WHERE i.exam_id IN ${scSql} AND i.kind IN ('gap','misconception') AND i.text IS NOT NULL
      ORDER BY i.created_at DESC LIMIT 25`).all();
    const insLines = insRows.map((r) => `[${r.chapter || "—"}/${r.kp_title || "?"}] ${(r.text || "").replace(/\s+/g, " ").slice(0, 110)}`).join("\n");

    // 长期记忆里的细颗粒薄弱(含自定义标记、怪模式、追问沉淀出来的观察)。
    const memRows = db.prepare(`SELECT subject, claim FROM memory_facts
      WHERE user_id=? AND active=1 AND valence='weak' AND (exam_id IN ${scSql} OR exam_id IS NULL)
      ORDER BY created_at DESC LIMIT 25`).all(user.id);
    const memLines = memRows.map((r) => `${r.subject || ""}: ${(r.claim || "").replace(/\s+/g, " ").slice(0, 100)}`).join("\n");

    // 当前生效的自定义学习模式(怪模式)——让诊断在用户自己的模式语境下进行。
    let modesTxt = ""; try { modesTxt = (activeModesDigest(user.id, exam.id) || "").slice(0, 900); } catch {}

    if (attempted.length < 3 && !insLines && !memLines) return Response.json({ diagnosis: null, reason: "no_data" });

    // 掌握度概览(带章节,便于模型识别"同章多个薄弱=章节地基问题")
    const kpLines = matrix.map((m) => `${m.chapter || "—"} / ${m.title}: ${m.level} ${m.accuracy}% (${m.attempts}题)`).join("\n");

    // 章节级正确率
    const chRows = db.prepare(`SELECT ch.title chapter, COUNT(*) n, SUM(a.correct) c
      FROM attempts a JOIN questions q ON q.id=a.question_id
      LEFT JOIN knowledge_points kp ON kp.id=q.kp_id
      LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id
      WHERE a.exam_id IN ${scSql} AND a.mode!='resolved' AND q.kp_id IS NOT NULL
      GROUP BY ch.title HAVING n>0 ORDER BY (1.0*SUM(a.correct)/COUNT(*)) ASC`).all();
    const chLines = chRows.map((r) => `${r.chapter || "—"}: ${Math.round(100 * (r.c || 0) / r.n)}% (${r.n}题)`).join("\n");

    // 最近错题(带标签,便于识别错误模式)
    const wrong = db.prepare(`SELECT a.created_at, a.tag, a.labels, q.body, q.qtype, kp.title kp_title, ch.title chapter
      FROM attempts a JOIN questions q ON q.id=a.question_id
      LEFT JOIN knowledge_points kp ON kp.id=q.kp_id
      LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id
      WHERE a.exam_id IN ${scSql} AND a.correct=0 AND a.mode!='resolved'
      ORDER BY a.created_at DESC LIMIT 40`).all();
    const wrongLines = wrong.map((w) => {
      let stem = ""; try { stem = (JSON.parse(w.body || "{}").stem || "").replace(/\s+/g, " ").slice(0, 90); } catch {}
      const tags = [w.tag, ...(() => { try { return (JSON.parse(w.labels || "[]") || []).map((l) => l.name); } catch { return []; } })()].filter(Boolean).join(",");
      return `[${w.chapter || "—"}/${w.kp_title || "?"}]${tags ? "{" + tags + "}" : ""} ${stem}`;
    }).join("\n");

    // 疑似回避:薄弱/未学但练得最少的知识点(可能在躲最难的内容)
    const avoid = matrix.filter((m) => m.level === "weak" || m.attempts === 0)
      .sort((a, b) => a.attempts - b.attempts).slice(0, 8)
      .map((m) => `${m.chapter || "—"} / ${m.title}: ${m.attempts}题`).join("\n");

    const out = await generateJson(
      `你是「${exam.name}」的备考诊断师。下面是考生的真实数据(错题、掌握度、追问/争论暴露的缺口、长期记忆里的细颗粒薄弱、以及生效的自定义学习模式)。请综合【全部】信号做根因分析,不要只看错题、也不要只按表面频率排:
【要求】
1) rootCauses:找出 1~3 个【最可能导致连锁失分的根因/前置知识点】——即它薄弱会拖垮一片其它知识点的那种,而不是表面上错得最多的。title 必须来自下面的知识点列表原文。why 说明为什么它是根因。
2) errorPatterns:从错题里提炼 2~3 个【反复出现的错误模式】(如某类题型的固定坑、某种方法反复用错、某类标签反复出现),每个给一句 evidence 和一个具体可做的 drill(训练动作)。
3) avoidance:判断考生是否在【逃避最难/最弱的内容】(看"疑似回避"里那些薄弱却几乎没练的点)。avoiding 布尔,detail 说明依据;没有就 avoiding=false。
4) summary:一句话——现在最该做的一件事。
只依据给出的数据,不要编造不存在的知识点。

【掌握度(章节/知识点: 等级 正确率 题数)】
${kpLines.slice(0, 3500)}

【章节正确率(从低到高)】
${chLines.slice(0, 800)}

【最近错题([章节/知识点]{标签} 题干片段)】
${wrongLines.slice(0, 2500)}

【疑似回避(薄弱/未学但练得最少)】
${avoid.slice(0, 800)}
${insLines ? "\n【追问/争论(苏格拉底式引导)中暴露的理解缺口——即使答对也算根因信号】\n" + insLines.slice(0, 1800) : ""}
${memLines ? "\n【长期记忆里记下的细颗粒薄弱(含自定义标记/怪模式沉淀)】\n" + memLines.slice(0, 1200) : ""}
${modesTxt ? "\n【当前生效的自定义学习模式规则——请在这些模式的语境下解读根因】\n" + modesTxt : ""}` + langInstruction(user.lang),
      { type: "object", properties: {
        rootCauses: { type: "array", items: { type: "object", properties: { title: { type: "string" }, chapter: { type: "string" }, why: { type: "string" } }, required: ["title", "why"] } },
        errorPatterns: { type: "array", items: { type: "object", properties: { name: { type: "string" }, evidence: { type: "string" }, drill: { type: "string" } }, required: ["name", "drill"] } },
        avoidance: { type: "object", properties: { avoiding: { type: "boolean" }, detail: { type: "string" } }, required: ["avoiding"] },
        summary: { type: "string" }
      }, required: ["rootCauses", "errorPatterns", "avoidance", "summary"] }
    );
    return Response.json({ diagnosis: out });
  } catch (e) { return aiErrorResponse(e); }
}
