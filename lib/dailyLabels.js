"use client";
// 今日任务条目的【链接 + 文案】。首页和本周计划表【共用这一份】——保证两边永远是同一件事、同一套口径。
// 以前"按天排期"和"今日任务"是两套平行系统,长期对不上;要改就改这里,别在某一边另写一套。
export function dailyLink(it) {
  return (it.methodHref ? it.methodHref
    : it.type === "review" ? "/practice?mode=review"
    : it.type === "practice" ? `/practice?kp=${it.kpId}&fresh=1`
    : it.type === "debate" ? `/arena?mode=debate&kp=${it.kpId}`
    : it.type === "socratic" ? `/arena?mode=socratic&kp=${it.kpId}`
    : it.type === "explore" ? `/study?kp=${it.kpId}&mode=explore`
    : it.type === "kp" ? `/study?kp=${it.kpId}`
    : it.type === "newkp" ? (it.kpId ? `/practice?kp=${it.kpId}&fresh=1` : (it.ahead && it.ahead.kpId ? `/practice?kp=${it.ahead.kpId}&fresh=1` : "/study"))
    : it.type === "free" && it.kpIds && it.kpIds.length ? `/practice?fresh=1&kps=${it.kpIds.join(",")}`
    : "/practice?fresh=1");
}

export function dailyLabel(it, t) {
  return (
    it.type === "review" ? `${t("重练到期错题")}${it.due ? ` (${it.due})` : ""}` :
    it.type === "practice" ? `✍️ ${t("练习:")}${it.title}${it.target != null ? ` (${it.count || 0}/${it.target})` : (it.n ? ` ×${it.n}` : "")}` :
    it.type === "debate" ? `🎤 ${t("辩论:")}${it.title}${it.n ? ` ×${it.n}` : ""}` :
    it.type === "socratic" ? `🧭 ${t("苏格拉底引导:")}${it.title}` :
    it.type === "explore" ? `🔍 ${t("自由探索:")}${it.title}` :
    it.type === "kp" ? `${it.root ? t("🔴根因薄弱点") + " " : it.weak ? t("🔴薄弱点") + " " : ""}${it.methodTag ? it.methodTag + " " : ""}${it.methodLabel ? t(it.methodLabel) : t("学习")}${it.target != null ? ` (${it.count || 0}/${it.target})` : ""}: ${it.chapter ? it.chapter + " · " : ""}${it.title}` :
    it.type === "newkp" ? (it.cycleDone
        ? `${t("本周期的新知识都学完了")} ✓${it.ahead ? ` · ${t("可选·超前学:")}${it.ahead.chapter ? it.ahead.chapter + " · " : ""}${it.ahead.title}` : ""}`
        : `${t("学新知识:")}${it.chapter ? it.chapter + " · " : ""}${it.title} (${t("今日")} ${it.count || 0}/${it.dailyTarget} · ${t("该知识点")} ${it.kpDone || 0}/${it.kpTarget})`) :
    `${t("自由练习薄弱点")} (${it.count || 0}/${it.target})${it.outOfCycle ? ` · ${(it.anchor && it.anchor.name) ? t("补旧薄弱·不在「{n}」的范围内").replace("{n}", it.anchor.name) : t("补旧薄弱·不在本次考核范围")}` : ""}`);
}
