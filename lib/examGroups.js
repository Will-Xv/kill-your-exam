import db from "@/lib/db";

// 【考试分组】——纯粹的界面/今日任务组织:把几门(可跨学科)考试列在一个名字下方便管理。
// 【不动作用域、不合并知识树/掌握度/资料】,和"考试家族(父子)/exam_merge 真合并"完全分开。
export function listGroups(userId) {
  try {
    const groups = db.prepare("SELECT id, name FROM exam_groups WHERE user_id=? ORDER BY id").all(Number(userId));
    return groups.map((g) => ({ ...g, examIds: db.prepare("SELECT exam_id FROM exam_group_members WHERE group_id=?").all(g.id).map((r) => r.exam_id) }));
  } catch { return []; }
}
export function createGroup(userId, name, examIds = []) {
  const info = db.prepare("INSERT INTO exam_groups(user_id,name) VALUES(?,?)").run(Number(userId), String(name || "分组").slice(0, 40));
  const gid = info.lastInsertRowid;
  addToGroup(gid, examIds);
  return gid;
}
export function addToGroup(groupId, examIds = []) {
  const st = db.prepare("INSERT OR IGNORE INTO exam_group_members(group_id, exam_id) VALUES(?,?)");
  let n = 0; for (const eid of (examIds || [])) { try { if (st.run(Number(groupId), Number(eid)).changes) n++; } catch {} }
  return n;
}
export function removeFromGroup(groupId, examIds = []) {
  let n = 0; for (const eid of (examIds || [])) { try { n += db.prepare("DELETE FROM exam_group_members WHERE group_id=? AND exam_id=?").run(Number(groupId), Number(eid)).changes; } catch {} }
  return n;
}
export function deleteGroup(userId, groupId) {
  try {
    const g = db.prepare("SELECT id FROM exam_groups WHERE id=? AND user_id=?").get(Number(groupId), Number(userId));
    if (!g) return false;
    db.prepare("DELETE FROM exam_group_members WHERE group_id=?").run(Number(groupId));
    db.prepare("DELETE FROM exam_groups WHERE id=?").run(Number(groupId));
    return true;
  } catch { return false; }
}
// 某考试属于哪个分组(名字),没有就 null。
export function groupNameOfExam(userId, examId) {
  try {
    const r = db.prepare("SELECT g.name FROM exam_group_members m JOIN exam_groups g ON g.id=m.group_id WHERE m.exam_id=? AND g.user_id=? LIMIT 1").get(Number(examId), Number(userId));
    return r ? r.name : null;
  } catch { return null; }
}
// 找一个分组(按名字模糊匹配),给杀手按名字操作用。
export function findGroup(userId, name) {
  try {
    const kw = String(name || "").toLowerCase().trim();
    const groups = listGroups(userId);
    return groups.find((g) => String(g.name || "").toLowerCase() === kw) || groups.find((g) => String(g.name || "").toLowerCase().includes(kw)) || null;
  } catch { return null; }
}
