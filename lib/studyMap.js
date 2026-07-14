// 类9.1:把一门考试上传的多份资料合并成【学习地图】——判断哪些重复/互补、覆盖了哪些主题、还缺什么、按什么顺序学。
import db, { examScope, scopeSql } from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";

export async function buildStudyMap(user, exam) {
  const scSql = scopeSql(examScope(exam.id));
  const mats = db.prepare(`SELECT id, filename, kind FROM materials WHERE exam_id IN ${scSql} AND status='ready' ORDER BY id`).all();
  if (mats.length < 2) return { map: null, reason: "need_more_materials", count: mats.length };

  const lines = mats.map((m) => {
    let sample = "";
    try {
      const cs = db.prepare(`SELECT content FROM chunks WHERE material_id=? ORDER BY id LIMIT 2`).all(m.id);
      sample = cs.map((c) => c.content || "").join(" ").replace(/\s+/g, " ").slice(0, 400);
    } catch {}
    return `《${m.filename}》[${m.kind}]${sample ? " 摘录:" + sample : (m.kind === "image" || m.kind === "audio" ? " (图片/音频,内容见附件)" : " (无文本摘录)")}`;
  }).join("\n");

  const chapters = db.prepare(`SELECT title FROM knowledge_points WHERE exam_id IN ${scSql} AND parent_id IS NULL ORDER BY sort`).all().map((c) => c.title).slice(0, 40).join("、");

  const out = await generateJson(
    `你是「${exam.name}」的资料整理师。下面是考生上传的多份资料(文件名[类型] + 内容摘录)。请把它们整理成一张【学习地图】:
${lines}
${chapters ? "\n【这门考试的章节】" + chapters : ""}

请输出:
1) groups:按主题把资料分组,每组 {topic, materials:[文件名], note}(这几份都讲这个主题)。
2) redundant:内容【高度重复/几乎重复】的资料组,每条 {materials:[文件名], note:哪里重复、留哪份就够}。没有=空数组。
3) complementary:互相【补充】的资料(如一份讲理论、一份是习题/图),每条 {materials:[文件名], note:怎么配合用}。
4) gaps:章节里【缺少资料支撑】的主题(有章节但没资料覆盖),逐条列;没有=空数组。
5) order:建议的学习顺序,每条 {material:文件名, why:为什么先学它}。
6) summary:一句话总览。
只依据给出的信息,别编不存在的文件。` + langInstruction(user.lang),
    { type: "object", properties: {
      groups: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, materials: { type: "array", items: { type: "string" } }, note: { type: "string" } }, required: ["topic", "materials"] } },
      redundant: { type: "array", items: { type: "object", properties: { materials: { type: "array", items: { type: "string" } }, note: { type: "string" } }, required: ["materials"] } },
      complementary: { type: "array", items: { type: "object", properties: { materials: { type: "array", items: { type: "string" } }, note: { type: "string" } }, required: ["materials"] } },
      gaps: { type: "array", items: { type: "string" } },
      order: { type: "array", items: { type: "object", properties: { material: { type: "string" }, why: { type: "string" } }, required: ["material"] } },
      summary: { type: "string" },
    }, required: ["groups", "redundant", "complementary", "gaps", "order", "summary"] }
  );
  return { map: out, materialCount: mats.length };
}
