import db, { familyScope, scopeSql } from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";

// 上传/删除资料后,后台刷新这门考试的【AI 认知自评】——把清单里已被资料满足的项标 done、
// 并据现有资料微调 confidence/uncertain/unknown/risks。让"还缺什么"随资料补齐而更新(不再建完就死)。
export async function refreshAssessmentBg(examId, lang) {
  try {
    const exam = db.prepare("SELECT id, name, self_assessment, checklist FROM exams WHERE id=?").get(Number(examId));
    if (!exam || !exam.self_assessment) return;   // 只刷新做过认知自评的考试
    let sa = null; try { sa = JSON.parse(exam.self_assessment); } catch {}
    if (!sa) return;
    let cl = []; try { cl = JSON.parse(exam.checklist || "[]"); } catch {}
    // 【盘点手上有哪些资料要算整个家族】判断"这门还缺什么"是按本考试的清单来的(不变),
    // 但可用资料本身是家族共享的 —— 母考试传了讲义,子考试就不该再说"你还缺讲义"。
    const mats = db.prepare(`SELECT filename, kind, source_url FROM materials WHERE exam_id IN ${scopeSql(familyScope(Number(examId)))} AND status='ready' AND COALESCE(auto,0)=0`).all();
    const matList = mats.map((m) => `${m.filename || m.source_url || "(未命名)"}${m.kind ? " [" + m.kind + "]" : ""}`).join("\n") || "(暂无)";
    const fileItems = cl.filter((c) => c && c.kind === "file").map((c) => c.item);

    const schema = { type: "object", properties: {
      confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
      uncertain: { type: "array", items: { type: "string" } },
      unknown: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      satisfied: { type: "array", items: { type: "string" }, description: "清单里【已被现有资料满足】的资料项(从下面清单里原样挑),没有就空数组" }
    }, required: ["confidence", "uncertain", "unknown", "risks", "satisfied"] };

    const out = await generateJson(
      `你是诚实的备考助手。这门考试:「${exam.name}」。\n你之前的认知自评:把握度=${sa.confidence || "?"};不确定=${(sa.uncertain || []).join("、") || "无"};仍不知道=${(sa.unknown || []).join("、") || "无"};风险=${(sa.risks || []).join("、") || "无"}。\n你当初列的【需要的文件资料】清单:${fileItems.join("、") || "无"}。\n\n考生【现在已上传的资料】:\n${matList}\n\n请据现有资料【重新评估】:\n- satisfied:上面清单里【哪些资料项现在已被这些上传满足】(原样挑清单里的项;拿不准/没覆盖就别挑,宁缺毋滥)。\n- confidence/uncertain/unknown/risks:据新资料【更新】(资料覆盖到的不确定点可移除或降级;仍没有的照旧保留)。要诚实,别因为传了东西就盲目自信。` + langInstruction(lang),
      schema);

    const satisfied = new Set((out.satisfied || []).map((x) => String(x)));
    const newCl = cl.map((c) => (c && c.kind === "file" && satisfied.has(c.item)) ? { ...c, done: true } : c);
    const newSa = { ...sa, confidence: out.confidence || sa.confidence, uncertain: out.uncertain || sa.uncertain, unknown: out.unknown || sa.unknown, risks: out.risks || sa.risks, refreshed_at: new Date().toISOString() };
    db.prepare("UPDATE exams SET self_assessment=?, checklist=? WHERE id=?").run(JSON.stringify(newSa), JSON.stringify(newCl), Number(examId));
  } catch {}
}
