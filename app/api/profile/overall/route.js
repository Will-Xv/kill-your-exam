import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { examSummary, overlapKps } from "@/lib/mastery";
import { generateJson, langInstruction } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 120;

function gatherExams(userId) {
  const exams = db.prepare(
    "SELECT id,name,exam_type,status FROM exams WHERE user_id=? AND deleted_at IS NULL ORDER BY id"
  ).all(userId);
  const perExam = exams.map((e) => ({ id: e.id, name: e.name, type: e.exam_type, status: e.status, ...examSummary(e.id) }));
  const overlap = overlapKps(perExam);
  return { perExam, overlap };
}

// 读取已缓存画像 + 实时统计
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { perExam, overlap } = gatherExams(u.id);
  let cached = null;
  try { cached = JSON.parse(u.profile_json || "{}").overall || null; } catch {}
  return Response.json({
    exams: perExam.map(({ kps, ...rest }) => rest),
    overlap: overlap.map((o) => ({ title: o.title, exams: o.appears.map((a) => a.exam) })),
    ai: cached,
  });
}

// 重新生成 AI 整体画像
export async function POST() {
  try {
    const u = await getSessionUser();
    if (!u) return unauthorized();
    const { perExam, overlap } = gatherExams(u.id);
    if (perExam.length === 0) return Response.json({ error: "no_exams" }, { status: 400 });

    const brief = perExam.map((e) =>
      `【${e.name}${e.type ? "·" + e.type : ""}】做题${e.done}·正确率${e.accuracy}%·活跃${e.activeDays}天` +
      `${e.weak.length ? "·薄弱:" + e.weak.slice(0, 8).join("/") : ""}` +
      `${e.mastered.length ? "·已掌握:" + e.mastered.slice(0, 8).join("/") : ""}`
    ).join("\n");
    const overlapBrief = overlap.length
      ? overlap.slice(0, 20).map((o) => `${o.title}(出现在:${o.appears.map((a) => a.exam + a.accuracy + "%").join("、")})`).join("\n")
      : "(暂无跨考试重叠的知识点)";

    const schema = { type: "object", properties: {
      summary: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      weaknesses: { type: "array", items: { type: "string" } },
      habits: { type: "array", items: { type: "string" } },
      transferable: { type: "array", items: { type: "string" } },
      advice: { type: "array", items: { type: "string" } },
    }, required: ["summary", "strengths", "weaknesses", "habits", "transferable", "advice"] };

    const out = await generateJson(
      `下面是同一位备考者在其【所有考试】中的表现汇总。请综合成一份"整体学习者画像",要跨考试地看,而不是就单科论单科。

各考试表现:
${brief}

跨考试重叠的知识点(同一能力在多门考试都用到):
${overlapBrief}

请输出:
- summary:两三句话总体评价这位学习者(整体水平、投入度、学习风格)。
- strengths:跨考试稳定发挥的强项(结合重叠知识点)。
- weaknesses:反复出现或影响面广的薄弱点。
- habits:从活跃天数/做题量等看出的学习习惯(客观,不评判人品)。
- transferable:某门考试练好的能力可以迁移去帮助另一门考试的具体建议(点名考试)。
- advice:2~4 条整体备考建议。
只依据数据,不要编造没有的考试或知识点。` + langInstruction(u.lang),
      schema
    );

    let p = {};
    try { p = JSON.parse(u.profile_json || "{}"); } catch {}
    p.overall = { ...out, generatedAt: new Date().toISOString() };
    db.prepare("UPDATE users SET profile_json=? WHERE id=?").run(JSON.stringify(p), u.id);
    return Response.json({ ai: p.overall });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
