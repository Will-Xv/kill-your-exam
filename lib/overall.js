import db from "@/lib/db";
import { examSummary, overlapKps } from "@/lib/mastery";
import { generate, generateJson, langInstruction, attachParts } from "@/lib/gemini";

// 整体画像 = 每个用户一份永久 markdown 文件,存在 users.profile_json.overallDoc。
// 每个考试都会读它,从而了解用户的整体情况。

export function getOverallDoc(user) {
  try { return JSON.parse(user.profile_json || "{}").overallDoc || ""; } catch { return ""; }
}

export function setOverallDoc(userId, md) {
  const u = db.prepare("SELECT profile_json FROM users WHERE id=?").get(userId);
  let p = {};
  try { p = JSON.parse(u?.profile_json || "{}"); } catch {}
  p.overallDoc = md || "";
  p.overallUpdatedAt = new Date().toISOString();
  db.prepare("UPDATE users SET profile_json=? WHERE id=?").run(JSON.stringify(p), userId);
  return p.overallUpdatedAt;
}

export function overallUpdatedAt(user) {
  try { return JSON.parse(user.profile_json || "{}").overallUpdatedAt || null; } catch { return null; }
}

// 汇总该用户所有考试的表现,供生成/展示用
export function gatherExams(userId) {
  const exams = db.prepare(
    "SELECT id,name,exam_type,status FROM exams WHERE user_id=? AND deleted_at IS NULL ORDER BY id"
  ).all(userId);
  const perExam = exams.map((e) => ({ id: e.id, name: e.name, type: e.exam_type, status: e.status, ...examSummary(e.id) }));
  const overlap = overlapKps(perExam);
  return { perExam, overlap };
}

// (重新)生成整体画像文件。可带用户指令 instruction 和附件 attachments,以及在现有文件基础上改。
export async function regenerateOverall(user, { instruction = "", attachments = null } = {}) {
  const { perExam, overlap } = gatherExams(user.id);
  if (perExam.length === 0 && !instruction && !(attachments && attachments.length)) return null;

  const brief = perExam.map((e) =>
    `【${e.name}${e.type ? "·" + e.type : ""}】做题${e.done}·正确率${e.accuracy}%·活跃${e.activeDays}天` +
    `${e.weak.length ? "·薄弱:" + e.weak.slice(0, 8).join("/") : ""}` +
    `${e.mastered.length ? "·已掌握:" + e.mastered.slice(0, 8).join("/") : ""}`
  ).join("\n") || "(暂无考试数据)";
  const overlapBrief = overlap.length
    ? overlap.slice(0, 20).map((o) => `${o.title}(${o.appears.map((a) => a.exam + a.accuracy + "%").join("、")})`).join("\n")
    : "(暂无跨考试重叠的知识点)";
  const existing = getOverallDoc(user);

  const prompt = `请维护一位备考者的【整体画像】文件(一份长期、跨所有考试的用户档案,markdown 格式)。它会被这个人的每一个考试读取,让每个考试都了解这个人的整体情况(学习风格、强弱项、习惯、可迁移能力、目标与偏好等)。

${existing ? "【现有整体画像(在此基础上更新,保留仍然成立的内容)】\n" + existing + "\n" : "(目前还没有整体画像,请新建一份)"}

【各考试最新表现】
${brief}

【跨考试重叠的能力】
${overlapBrief}
${instruction ? "\n【用户本次的补充/修改要求】\n" + instruction : ""}
${attachments && attachments.length ? "\n【用户还上传了文件,请结合其中信息更新画像】" : ""}

输出要求:直接输出更新后的整体画像 markdown 全文(不要用代码块包裹)。结构建议包含:一句话概述、学习风格与习惯、强项、薄弱项、跨考试可迁移能力、目标与偏好、整体建议。只依据数据与用户提供的信息,不要编造不存在的考试。数学公式用 $...$ 包裹。` + langInstruction(user.lang);

  const ap = attachParts(attachments);
  let md;
  if (ap.length) {
    const res = await generate(null, { contents: [{ role: "user", parts: [{ text: prompt }].concat(ap) }] });
    md = res.text;
  } else {
    const res = await generate(prompt);
    md = typeof res === "string" ? res : res.text;
  }
  md = String(md || "").trim();
  if (!md) return null;
  setOverallDoc(user.id, md);
  return md;
}

// 用户答题到里程碑时后台自动刷新(每 25 题一次)。不阻塞响应。
export function maybeAutoUpdateOverall(user) {
  try {
    const n = db.prepare("SELECT COUNT(*) c FROM attempts WHERE exam_id IN (SELECT id FROM exams WHERE user_id=?)").get(user.id).c;
    if (n > 0 && n % 25 === 0) {
      regenerateOverall(user, {}).catch(() => {});
    }
  } catch {}
}
