"use client";
import { confirmDialog, alertDialog } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Leaderboard from "@/components/Leaderboard";
import Link from "next/link";
import { useT } from "@/components/I18n";
import Tour from "@/components/Tour";
import { LayoutLab, Editable } from "@/components/uilab/LayoutLab";
import * as placement from "@/lib/uilab/placement";
import { getItem, itemVisibleTo } from "@/lib/uilab/items";
import FeatureModule from "@/components/uilab/FeatureModule";
import FitText from "@/components/FitText";
import MD from "@/components/MD";

export default function HomeClient({ initialLeaderboard = null, initialIsDev = false, initialData = null }) {
  const t = useT();
  const [data, setData] = useState(initialData);
  const [daily, setDaily] = useState(null);
  const [sugg, setSugg] = useState(null);
  const [suggBusy, setSuggBusy] = useState(false);
  const [weakCount, setWeakCount] = useState(0);
  const [dateOpen, setDateOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [sprintOpen, setSprintOpen] = useState(false);
  const [sprintReco, setSprintReco] = useState(null); // "original"(掌握≥70%→自查+模拟考) / "test"(<70%→先测试再复习)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [unread, setUnread] = useState(0);
  const [isDev, setIsDev] = useState(initialIsDev);
  placement.useItems();
  const [pbDesktop, setPbDesktop] = useState(true);
  useEffect(() => { const mq = window.matchMedia("(min-width:768px)"); const on = () => setPbDesktop(mq.matches); on(); try { mq.addEventListener("change", on); } catch { mq.addListener(on); } return () => { try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); } }; }, []);
  useEffect(() => { fetch("/api/inbox").then((r) => r.json()).then((d) => setUnread(d.unread || 0)).catch(() => {}); }, []);
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then((d) => setIsDev(!!(d.user && d.user.isDeveloper))).catch(() => {}); }, []);
  const loadHome = () => {
    fetch("/api/exam").then((r) => r.json()).then(setData).catch(() => {});
    fetch("/api/daily").then((r) => r.json()).then(setDaily).catch(() => {});
    fetch("/api/mastery").then((r) => r.json()).then((d) => { const m = d.matrix || []; const weak = m.filter((x) => x.level === "weak" || x.level === "unlearned").length; setWeakCount(weak); const total = m.length; const ratio = total ? (total - weak) / total : 0; setSprintReco(ratio >= 0.7 ? "original" : "test"); }).catch(() => {});
  };
  useEffect(() => {
    loadHome();
    // 杀手改完(今日任务/计划/资料/进度等)会派发全局事件 → 首页即时重拉,不用手动刷新
    const onChanged = () => loadHome();
    // 页面重新可见/获得焦点时也重拉(去练习/竞技场做完事回首页,数据自动最新,不用手动刷新)——节流3s
    let lastLoad = Date.now();
    const onFocus = () => { if (document.visibilityState !== "hidden" && Date.now() - lastLoad > 3000) { lastLoad = Date.now(); loadHome(); } };
    try { window.addEventListener("kye:data-changed", onChanged); document.addEventListener("visibilitychange", onFocus); window.addEventListener("focus", onFocus); } catch {}
    return () => { try { window.removeEventListener("kye:data-changed", onChanged); document.removeEventListener("visibilitychange", onFocus); window.removeEventListener("focus", onFocus); } catch {} };
  }, []);

  async function loadSugg() {
    setSuggBusy(true);
    try { const d = await fetch("/api/strategy").then((r) => r.json()); setSugg(d.suggestion || { none: true }); } catch {}
    setSuggBusy(false);
  }
  async function adopt() {
    await fetch("/api/strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategyMd: sugg.revised_strategy_md }) });
    setSugg({ adopted: true });
  }

  async function saveDate(v) {
    setDateOpen(false);
    setData((d) => (d ? { ...d, exam: { ...d.exam, exam_date: v || null } } : d));
    try { await fetch("/api/exam/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setDate", examId: data?.exam?.id, examDate: v || null }) }); } catch {}
  }

  async function markComplete() {
    if (!await confirmDialog(t("标记为已完成?记录会保留,这门考试仍可正常练习/切换,只是不再显示倒计时。"))) return;
    const eid = data?.exam?.id;
    try {
      const r = await fetch("/api/exam/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", examId: eid }) });
      if (!r.ok) { const tx = await r.text().catch(() => ""); alertDialog(t("标记失败:") + " HTTP " + r.status + " " + tx); return; }
      const d = await r.json().catch(() => ({}));
      if (d && d.ok === false) { alertDialog(t("标记失败:") + " " + (d.error || "")); return; }
      // 真子考试完成→让用户选:把进度映射进家族知识树,还是放着不动。
      if (d && d.isSubExam) {
        if (await confirmDialog(t("这门子考试已完成。要把它的掌握度映射到家族知识树(母考试和同家族其它考试的对应知识点)吗?点\u201c取消\u201d则放着不动。"))) {
          try {
            const mr = await fetch("/api/exam/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "map_mastery_to_family", examId: eid }) }).then((x) => x.json());
            if (mr && mr.ok) alertDialog(mr.mapped ? t("已把 {n} 个知识点的掌握度映射进家族知识树。").replace("{n}", mr.mapped) : (mr.note || t("没有可映射的知识点。")));
            else alertDialog(t("映射失败:") + " " + ((mr && mr.reason) || ""));
          } catch (e) { alertDialog(t("映射失败:") + " " + ((e && e.message) || e)); }
        }
      }
      location.reload();
    } catch (e) { alertDialog(t("标记失败:") + " " + ((e && e.message) || e)); }
  }
  async function dismissDiag() {
    setDaily((d) => (d ? { ...d, rootCauseBanner: null } : d));
    try { await fetch("/api/diagnose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss" }) }); } catch {}
  }
  async function dismissResolve() {
    setDaily((d) => (d ? { ...d, resolveBanner: null } : d));
    try { await fetch("/api/bank/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss" }) }); } catch {}
  }
  async function uncomplete() {
    try { await fetch("/api/exam/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "uncomplete", examId: data?.exam?.id }) }); } catch {}
    location.reload();
  }
  async function switchExam(id) {
    if (!id || id === data?.exam?.id) return;
    try { await fetch("/api/exam/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ examId: id }) }); } catch {}
    try { const d = await fetch("/api/exam").then((r) => r.json()); setData(d); } catch {}
    fetch("/api/daily").then((r) => r.json()).then(setDaily).catch(() => {});
  }

  if (!data) return <div className="mx-auto max-w-3xl px-4 pt-6"><div className="shimmer h-40 rounded-3xl" /></div>;

  if (!data.exam) {
    return (
      <>
        <Tour firstTime />
        <div className="mx-auto flex min-h-[75vh] max-w-md flex-col items-center justify-center px-4 text-center">
          <div className="animate-in grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-amber-500 to-amber-600 text-4xl shadow-xl shadow-amber-500/30">📘</div>
          <h1 className="animate-in d1 mt-6 text-3xl font-black">{t("欢迎!先设置一门考试")}</h1>
          <p className="animate-in d2 mt-3 text-[#cdbfa0]">{t("还没有设置考试。花 5 分钟告诉我你要考什么,")}{t("我会先坦白我知道什么、不知道什么。")}</p>
          <Link href="/onboarding" className="btn animate-in d3 mt-7 text-base">🚀 {t("开始设置考试")}</Link>
        </div>
      </>
    );
  }

  const { exam, stats, topExam, subExams, taskSubs, aggregating, aggregateCount } = data;
  const _vToday = daily?.plan?.date || null; // 服务端虚拟今天(dev 日期穿越生效);没加载到就用真实今天
  const days = exam.exam_date ? Math.ceil((new Date(exam.exam_date + "T00:00:00") - (_vToday ? new Date(_vToday + "T00:00:00") : new Date())) / 86400000) : null;
  useEffect(() => { if (exam.completed_at || days == null || days < 0 || days >= 7) return; try { const k = `kye_sprint:${exam.id}:${new Date().toISOString().slice(0, 10)}`; if (!localStorage.getItem(k)) setSprintOpen(true); } catch {} }, [exam.id, days, exam.completed_at]);
  const completeBtn = <button className="rounded-full bg-[#2f2413] px-2.5 py-0.5 text-xs font-medium text-[#f6efdd] hover:opacity-90" onClick={markComplete}>✅ {t("标记为已完成")}</button>;
  const acc = stats.attemptCount ? Math.round((stats.correctCount / stats.attemptCount) * 100) : null;
  const items = daily?.plan?.items || [];
  const crossOthers = daily?.crossExam?.others || [];
  const crossUrgent = daily?.urgentCross || [];
  // 其他考试的今日一件事标签(客户端 i18n,考试名是动态的原样显示)
  const crossTaskLabel = (top) => !top ? t("练一练") :
    top.type === "review" ? `${t("复习到期")}${top.count ? ` (${top.count})` : ""}` :
    top.type === "kp" ? `${t("攻薄弱点:")}${top.title || ""}` :
    t("自由练习一组");
  const firstUndone = items.find((it) => !it.done);
  const allDone = items.length && !firstUndone;
  const linkFor = (it) => (it.methodHref ? it.methodHref
    : it.type === "review" ? "/practice?mode=review"
    : it.type === "practice" ? `/practice?kp=${it.kpId}&fresh=1`
    : it.type === "debate" ? `/arena?mode=debate&kp=${it.kpId}`
    : it.type === "socratic" ? `/arena?mode=socratic&kp=${it.kpId}`
    : it.type === "explore" ? `/study?kp=${it.kpId}&mode=explore`
    : it.type === "kp" ? `/study?kp=${it.kpId}`
    : it.type === "newkp" ? (it.kpId ? `/practice?kp=${it.kpId}&fresh=1` : (it.ahead && it.ahead.kpId ? `/practice?kp=${it.ahead.kpId}&fresh=1` : "/study"))
    : it.type === "free" && it.kpIds && it.kpIds.length ? `/practice?fresh=1&kps=${it.kpIds.join(",")}`
    : "/practice?fresh=1");
  const labelFor = (it) =>
    it.type === "review" ? `${t("重练到期错题")}${it.due ? ` (${it.due})` : ""}` :
    it.type === "practice" ? `✍️ ${t("练习:")}${it.title}${it.target != null ? ` (${it.count || 0}/${it.target})` : (it.n ? ` ×${it.n}` : "")}` :
    it.type === "debate" ? `🎤 ${t("辩论:")}${it.title}${it.n ? ` ×${it.n}` : ""}` :
    it.type === "socratic" ? `🧭 ${t("苏格拉底引导:")}${it.title}` :
    it.type === "explore" ? `🔍 ${t("自由探索:")}${it.title}` :
    it.type === "kp" ? `${it.root ? t("🔴根因薄弱点") + " " : it.weak ? t("🔴薄弱点") + " " : ""}${it.methodTag ? it.methodTag + " " : ""}${it.methodLabel ? t(it.methodLabel) : t("学习")}${it.target != null ? ` (${it.count || 0}/${it.target})` : ""}: ${it.chapter ? it.chapter + " · " : ""}${it.title}` :
    it.type === "newkp" ? (it.cycleDone
        ? `${t("本周期的新知识都学完了")} ✓${it.ahead ? ` · ${t("可选·超前学:")}${it.ahead.chapter ? it.ahead.chapter + " · " : ""}${it.ahead.title}` : ""}`
        : `${t("学新知识:")}${it.chapter ? it.chapter + " · " : ""}${it.title} (${t("今日")} ${it.count || 0}/${it.dailyTarget} · ${t("该知识点")} ${it.kpDone || 0}/${it.kpTarget})`) :
    `${t("自由练习薄弱点")} (${it.count || 0}/${it.target})${it.outOfCycle ? ` · ${(it.anchor && it.anchor.name) ? t("补旧薄弱·不在「{n}」的范围内").replace("{n}", it.anchor.name) : t("补旧薄弱·不在本次考核范围")}` : ""}`;

  const features = [
    { href: "/study", icon: "📖", title: t("学习"), desc: t("跟 AI 学知识点 + 练习"), grad: "from-amber-400 to-orange-500", tint: "hover:border-amber-300 hover:shadow-amber-500/15", ig: "from-amber-50 to-orange-50" },
    { href: "/mock", icon: "📝", title: t("模拟考"), desc: t("限时全真模拟"), grad: "from-orange-400 to-rose-500", tint: "hover:border-orange-300 hover:shadow-orange-500/15", ig: "from-orange-50 to-rose-50" },
    { href: "/prep", icon: "🎒", title: t("屠杀准备"), desc: t("考务/应试自测"), grad: "from-lime-400 to-green-500", tint: "hover:border-lime-300 hover:shadow-lime-500/15", ig: "from-lime-50 to-green-50" },
    { href: "/mistakes", icon: "📕", title: t("错题本"), desc: t("重练做错的题"), grad: "from-rose-400 to-red-500", tint: "hover:border-rose-300 hover:shadow-rose-500/15", ig: "from-rose-50 to-red-50" },
    { href: "/notes", icon: "📓", title: t("笔记本"), desc: t("收藏的题+随手笔记"), grad: "from-sky-400 to-blue-500", tint: "hover:border-sky-300 hover:shadow-sky-500/15", ig: "from-sky-50 to-blue-50" },
    { href: "/performances", icon: "🎬", title: t("表演回放"), desc: t("回看录像+AI点评,可重做"), grad: "from-fuchsia-400 to-purple-500", tint: "hover:border-fuchsia-300 hover:shadow-fuchsia-500/15", ig: "from-fuchsia-50 to-purple-50" },
    { href: "/arena", icon: "🎮", title: t("竞技场"), desc: t("错题Boss战/庭审/辩论赛"), grad: "from-indigo-400 to-violet-500", tint: "hover:border-indigo-300 hover:shadow-indigo-500/15", ig: "from-indigo-50 to-violet-50" },
    { href: "/tasks", icon: "🛠️", title: t("实践作业"), desc: t("编程/实验:动手做+判分"), grad: "from-teal-400 to-cyan-500", tint: "hover:border-teal-300 hover:shadow-teal-500/15", ig: "from-teal-50 to-cyan-50" },
    { href: "/inbox", icon: "📬", title: t("收件箱"), desc: t("更新公告与信件"), grad: "from-amber-400 to-orange-500", tint: "hover:border-amber-300 hover:shadow-amber-500/15", ig: "from-amber-50 to-orange-50" },
    { href: "/profile", icon: "🧭", title: t("你的全部杀技"), desc: t("跨考试的你"), grad: "from-violet-400 to-purple-500", tint: "hover:border-violet-300 hover:shadow-violet-500/15", ig: "from-violet-50 to-purple-50" }
  ];

  const __bp = pbDesktop ? "desktop" : "mobile";
  const gridCards = placement.active()
    ? placement.itemsIn(__bp, "morefeatures", placement.renderPlacement()).map((e) => getItem(e.item)).filter((it) => it && it.href && itemVisibleTo(it, { isDeveloper: isDev })).map((it) => ({ href: it.href, icon: it.icon, title: t(it.label), desc: t(it.desc) }))
    : features.map((f) => ({ href: f.href, icon: f.icon, title: f.title, desc: f.desc, grad: f.grad, tint: f.tint, ig: f.ig }));
  const zoneModules = placement.active()
    ? placement.itemsIn(__bp, "zone", placement.renderPlacement()).map((e) => getItem(e.item)).filter((it) => it && it.href && !it.native && itemVisibleTo(it, { isDeveloper: isDev }))
    : [];
  const nativeShown = (nid) => { if (!placement.active()) return true; const ps = placement.placementOf(__bp, nid, placement.renderPlacement()); if (!ps.length) return true; return ps.some((p) => p.where === "zone"); };

  return (
    <>
      <Tour />
      <LayoutLab enabled={true}>
      {nativeShown("leaderboard") && <Editable id="leaderboard"><Leaderboard initial={initialLeaderboard} /></Editable>}
      {/* hero:浅黄底 + 右上角手绘血刃插画 */}
      {nativeShown("hero") && (
      <Editable id="hero">
      <div className="animate-in relative overflow-hidden rounded-3xl p-6 shadow-xl ring-1 ring-[#d9c89b]" style={{ background: "#efe3c4", color: "#2f2413" }}>
        {/* 手机端:手绘血刃(内联 SVG);pad/桌面(md+,含 iPad 竖屏):原来的刺客贴画 */}
        <img src="/illustrations/sticker.png" alt="" aria-hidden="true" loading="lazy" className="pointer-events-none absolute -right-2 -top-[58px] hidden w-[50%] max-w-[350px] select-none md:block" style={{ filter: "drop-shadow(0 4px 6px rgba(60,40,15,.18))" }} />
        <svg viewBox="0 0 120 170" aria-hidden="true" className="pointer-events-none absolute right-2 top-2 h-28 w-auto select-none rotate-[16deg] md:hidden" style={{ filter: "drop-shadow(0 4px 6px rgba(60,40,15,.22))" }}>
          {/* 刀柄 */}
          <rect x="53" y="6" width="14" height="30" rx="4" fill="#6b4a25" stroke="#2f2413" strokeWidth="3" />
          <path d="M56 12 h8 M56 20 h8 M56 28 h8" stroke="#2f2413" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
          <circle cx="60" cy="6" r="5" fill="#2f2413" />
          {/* 护手 */}
          <path d="M38 40 q22 -8 44 0" stroke="#2f2413" strokeWidth="7" fill="none" strokeLinecap="round" />
          {/* 刀身 */}
          <path d="M50 42 L70 42 L64 120 L60 132 L56 120 Z" fill="#c7ccc2" stroke="#2f2413" strokeWidth="3" strokeLinejoin="round" />
          <path d="M60 48 L60 118" stroke="#2f2413" strokeWidth="1.6" opacity=".6" />
          {/* 血:刀身上的血迹 */}
          <path d="M58 70 q7 14 3 34" stroke="#9e140c" strokeWidth="3.5" fill="none" strokeLinecap="round" opacity=".92" />
          {/* 血:刀尖滴落 */}
          <path d="M60 132 q-4 12 0 20 q4 -8 0 -20 Z" fill="#9e140c" />
          <circle cx="60" cy="160" r="4.5" fill="#9e140c" />
          <circle cx="49" cy="150" r="2.6" fill="#9e140c" opacity=".85" />
        </svg>
        <div className="relative z-10">
          {topExam && exam.id !== topExam.id ? (
            <button onClick={() => switchExam(topExam.id)} title={t("点标题回到最顶层考试")} className="block text-left text-2xl font-black tracking-tight hover:underline" style={{ color: "#2f2413" }}>↰ {topExam.name}</button>
          ) : (
            <Link href="/exams" className="block text-2xl font-black tracking-tight hover:underline" style={{ color: "#2f2413" }}>{(topExam && topExam.name) || exam.name}</Link>
          )}
          {aggregating && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#2f2413]/[0.08] px-2.5 py-0.5 text-[11px] font-semibold text-[#6b4a25] ring-1 ring-[#dbc999]">🧩 {t("汇总复习")} · {t("含 {n} 门子考试").replace("{n}", aggregateCount)}</div>
          )}
          {(subExams && subExams.length > 0) && (() => {
            // 子考试(用 exam_date),按考试日期升序排(没日期的排最后)。实践作业已移到「今日任务」里。
            const mixed = ((subExams || []).map((sx) => ({ _t: "exam", _d: sx.exam_date || null, sx })))
              .sort((a, b) => (a._d && b._d) ? (a._d < b._d ? -1 : a._d > b._d ? 1 : 0) : (a._d ? -1 : b._d ? 1 : 0));
            return (
            <div className="mt-2">
              <span className="text-[11px] font-semibold text-[#8a6a2c]">{t("子考试")}:</span>
              <div className="mt-1 flex flex-col gap-1">
                {mixed.map((it) => {
                  if (it._t === "exam") {
                    const sx = it.sx;
                    const on = sx.id === exam.id;
                    const direct = sx.depth === 0;
                    const gening = sx.setup_state === "generating" || sx.setup_state === "draft";
                    if (gening) return (
                      <span key={"ex" + sx.id} style={{ marginLeft: sx.depth * 18 }} title={t("正在后台生成内容,可能要几分钟;好了会自动就绪,现在还切不进去。")}
                        className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium bg-[#3d2b10]/[0.04] text-[#9a7a4a] ring-1 ring-[#e4d6ac] cursor-default animate-pulse">
                        {!direct && <span className="opacity-50">└</span>}⏳ {sx.name} · {t("生成中…")}
                      </span>
                    );
                    return (
                      <button key={"ex" + sx.id} onClick={() => switchExam(sx.id)} title={on ? t("当前考试") : (direct ? t("切换到这个子考试") : t("切换到这个下级子考试"))}
                        style={{ marginLeft: sx.depth * 18 }}
                        className={"inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 font-medium transition " + (direct ? "text-xs" : "text-[11px]") + " " + (on ? " bg-[#2f2413] text-[#f6efdd] ring-1 ring-[#2f2413]" : direct ? " bg-[#3d2b10]/[0.08] text-[#5b431f] ring-1 ring-[#dbc999] hover:brightness-95" : " bg-[#3d2b10]/[0.04] text-[#7a5a2a] ring-1 ring-[#e4d6ac] hover:brightness-95")}>
                        {!direct && <span className="opacity-50">└</span>}{sx.name}{sx.exam_date ? <span className="opacity-60 text-[10px]"> ⏳{sx.exam_date.slice(5)}</span> : null}
                      </button>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
            );
          })()}
          <div className="mt-1">
            {dateOpen ? (
              <input type="date" autoFocus defaultValue={exam.exam_date || ""} className="rounded-lg border border-[#d9c89b] bg-white/80 px-2 py-1 text-sm text-[#2f2413]" onChange={(e) => saveDate(e.target.value)} onBlur={() => setDateOpen(false)} />
            ) : exam.completed_at ? (
              <span className="inline-flex items-center gap-2 text-sm text-[#6b4a25]">✅ {t("已完成")}<button className="rounded-full bg-[#3d2b10]/[0.08] px-2 py-0.5 text-xs text-[#6b4a25] ring-1 ring-[#dbc999] hover:brightness-95" onClick={uncomplete}>{t("取消完成")}</button></span>
            ) : days != null && days < 0 ? (
              <span className="inline-flex flex-wrap items-center gap-2"><button className="text-left text-[#6b4a25] hover:opacity-80" onClick={() => setDateOpen(true)} title={t("点击修改考试日期")}>📅 {t("考试日期已过")} <span className="text-xs">✎</span></button>{completeBtn}</span>
            ) : days != null ? (
              <span className="inline-flex flex-wrap items-center gap-2"><button className="text-left text-[#6b4a25] hover:opacity-80" onClick={() => setDateOpen(true)} title={t("点击修改考试日期")}>{t("距猎杀")} <span className="text-4xl font-black text-[#2f2413]">{days}</span> {t("天")} <span className="text-xs">✎</span>{daily && <span className="ml-2 text-sm text-[#8a6a2c]">· 🔥 {daily.activeDays} {t("天")}</span>}</button>{completeBtn}</span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2"><button className="rounded-lg bg-[#2f2413] px-3 py-1 text-sm font-medium text-[#f6efdd]" onClick={() => setDateOpen(true)}>📅 {t("设置考试日期")}</button>{completeBtn}</span>
            )}
          </div>
        </div>
        <div className="relative z-10 mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-[#3d2b10]/[0.06] py-2 ring-1 ring-[#dbc999]"><div className="text-xl font-bold">{stats.todayCount}</div><div className="text-[11px] text-[#7a5a2a]">{t("今日做题")}</div></div>
          <div className="rounded-2xl bg-[#3d2b10]/[0.06] py-2 ring-1 ring-[#dbc999]"><div className="text-xl font-bold">{acc == null ? "—" : acc + "%"}</div><div className="text-[11px] text-[#7a5a2a]">{t("总正确率")}</div></div>
          <Link href="/materials" className="block rounded-2xl py-2 ring-1 ring-black/10 transition hover:brightness-110" style={{ background: "rgba(47,36,19,.78)" }}><div className="text-xl font-bold text-[#f6efdd]" style={{ textShadow: "0 1px 3px rgba(0,0,0,.65)" }}>{stats.matCount}</div><div className="text-[11px] text-[#ecdcb6]" style={{ textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>{t("资料数")}</div></Link>
        </div>
      </div>
      </Editable>
      )}

      {sprintOpen && mounted && createPortal((
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setSprintOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-[#fbf6e9] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-red-700">⏰ {t("距考试不到一周了!")}</h2>
            <p className="mt-1 text-sm text-[#5b431f]">{sprintReco === "original" ? t("你掌握得不错——去自查一下、再做套模拟考确认就好:") : t("你还有不少没掌握——建议先测一套摸清底,再针对性攻:")}{weakCount > 0 ? ` (${t("还有 {n} 个薄弱/未学").replace("{n}", weakCount)})` : ""}</p>
            {(() => {
              const selfcheck = (primary) => (<a key="s" href="/study" className={"block rounded-xl px-4 py-2.5 text-sm font-semibold " + (primary ? "bg-[#2f2413] text-[#f6efdd] hover:opacity-90" : "bg-white text-[#2f2413] ring-1 ring-[#dbc999] hover:bg-[#f3ecda]")}>🔎 {t("去学习页自查")}<span className={"mt-0.5 block text-xs font-normal " + (primary ? "opacity-80" : "text-stone-500")}>{t("过一遍知识点,确认还欠哪儿")}</span></a>);
              const mock = (primary) => (<a key="m" href="/mock" className={"block rounded-xl px-4 py-2.5 text-sm font-semibold " + (primary ? "bg-[#2f2413] text-[#f6efdd] hover:opacity-90" : "bg-white text-[#2f2413] ring-1 ring-[#dbc999] hover:bg-[#f3ecda]")}>📝 {t("去模拟考")}<span className={"mt-0.5 block text-xs font-normal " + (primary ? "opacity-80" : "text-stone-500")}>{t("做一套全真模拟,查漏补缺")}</span></a>);
              const testFirst = (<a key="t" href="/mock" className="block rounded-xl bg-[#2f2413] px-4 py-2.5 text-sm font-semibold text-[#f6efdd] hover:opacity-90">📝 {t("先测试再复习")}<span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{t("推荐")}</span><span className="mt-0.5 block text-xs font-normal opacity-80">{t("先做一套模拟考,再针对性攻错的地方")}</span></a>);
              const opts = sprintReco === "original" ? [selfcheck(true), mock(false)] : [testFirst, selfcheck(false)];
              return (<div className="mt-3 space-y-2">{opts}</div>);
            })()}
            <div className="mt-3 text-right">
              <button onClick={() => { try { localStorage.setItem(`kye_sprint:${exam.id}:${new Date().toISOString().slice(0, 10)}`, "1"); } catch {} setSprintOpen(false); }} className="text-xs text-stone-500 underline hover:opacity-80">{t("今天先不")}</button>
            </div>
          </div>
        </div>
      ), document.body)}
      {!exam.completed_at && days != null && days >= 0 && days < 7 && (
        <Editable id="weekwarn">
        <div className="animate-in card mt-4 border border-red-300 bg-red-50/80">
          <p className="font-semibold text-red-700">⏰ {t("距猎杀不到一周了!")}</p>
          <p className="mt-1 text-sm text-slate-600">{t("建议现在:到「学习」页自查还欠缺/薄弱的知识点,并做一次全真模拟考,查漏补缺。")}{weakCount > 0 ? `(${t("目前还有")} ${weakCount} ${t("个薄弱/未学的知识点")})` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/study" className="btn py-2 text-sm">🔎 {t("去学习页自查")}</Link>
            <Link href="/mock" className="btn-ghost py-2 text-sm">📝 {t("去模拟考")}</Link>
          </div>
        </div>
        </Editable>
      )}

      {daily?.resolveBanner && (
        <div className="card animate-in mt-4 border-emerald-300 bg-emerald-50">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">📎 {t("从资料里找到了真题")}</div>
              <p className="mt-0.5 text-sm font-semibold text-[#14532d]">
                {t("在你上传的教材里定位并入库了")} {daily.resolveBanner.added} {t("道真题")}
                {daily.resolveBanner.misses > 0 ? `，${daily.resolveBanner.misses} ${t("条没找到(未编题)")}` : ""}
                {daily.resolveBanner.files?.length ? `（${daily.resolveBanner.files.join("、")}）` : ""}
              </p>
            </div>
            <button onClick={dismissResolve} title={t("知道了")} className="shrink-0 text-sm text-emerald-500 hover:text-emerald-700">✕</button>
          </div>
          {daily.resolveBanner.added > 0 && <a href="/practice?fresh=1" className="mt-2 inline-block text-xs font-semibold text-emerald-700 underline">{t("去练这些真题")} →</a>}
        </div>
      )}

      {daily?.rootCauseBanner && (
        <div className="card animate-in mt-4 border-rose-300 bg-rose-50">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-rose-700">🔍 {t("根因诊断")}</div>
              <p className="mt-0.5 text-sm font-semibold text-[#5a2d0c]">{daily.rootCauseBanner.summary}</p>
              {daily.rootCauseBanner.markedCount > 0 && <p className="mt-0.5 text-xs text-rose-700/80">{t("已在掌握度矩阵标出根因知识点")}（{daily.rootCauseBanner.markedCount}）</p>}
            </div>
            <button onClick={dismissDiag} title={t("知道了")} className="shrink-0 text-sm text-rose-400 hover:text-rose-600">✕</button>
          </div>
          <Link href="/study" className="mt-2 inline-block text-xs font-semibold text-rose-700 underline">{t("去看根因知识点")} →</Link>
        </div>
      )}

      {/* today's plan */}
      {nativeShown("today") && (
      <Editable id="today">
      <div id="tour-today" className="card animate-in d1 mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <h2 className="shrink-0 font-bold">📋 {t("今日任务")}</h2>
            {crossOthers.length > 0 && (() => {
              const chips = [{ id: exam.id, name: exam.name, cur: true }, ...crossOthers.map((e) => ({ id: e.examId, name: e.name, cur: false }))];
              const shown = groupOpen ? chips : chips.slice(0, 3);
              return (
                <div className="flex flex-wrap items-center gap-1" title={t("同组考试,点一下切换")}>
                  {shown.map((c) => (
                    <button key={c.id} onClick={() => !c.cur && switchExam(c.id)} disabled={c.cur}
                      className={"max-w-[9rem] truncate rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition " + (c.cur ? "bg-[#2f2413] text-[#f6efdd] ring-[#2f2413] cursor-default" : "bg-[#3d2b10]/[0.06] text-[#6b4a25] ring-[#dbc999] hover:brightness-95")}>
                      {c.name}
                    </button>
                  ))}
                  {!groupOpen && chips.length > 3 && (
                    <button onClick={() => setGroupOpen(true)} className="rounded-full bg-[#3d2b10]/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[#8a6a2c] ring-1 ring-[#dbc999] hover:brightness-95" title={t("展开全部同组考试")}>… +{chips.length - 3}</button>
                  )}
                  {groupOpen && chips.length > 3 && (
                    <button onClick={() => setGroupOpen(false)} className="rounded-full px-1.5 py-0.5 text-[11px] text-[#8a6a2c] hover:opacity-80">▲</button>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {allDone && <span className="text-sm font-semibold text-amber-700">{t("全部完成 🎉")}</span>}
            <Link href="/plan" className="inline-flex items-center gap-1.5 rounded-full bg-[#2f2413] px-3.5 py-1.5 text-sm font-semibold text-[#f6efdd] shadow-sm hover:opacity-90">📅 {t("本周计划表")}</Link>
          </div>
        </div>
        {daily?.recipe && (
          <div className="mb-2 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800 ring-1 ring-indigo-200">
            🧭 {t("学习配方")}{t("「")}{daily.recipe.name}{t("」")}· {t("阶段")} {daily.recipe.phaseIndex + 1}/{daily.recipe.phaseTotal}{daily.recipe.phase ? " · " + daily.recipe.phase : ""}{daily.recipe.allDone ? " ✓" : ""}
          </div>
        )}
        {!daily ? <div className="shimmer h-10 rounded-xl" /> : (
          <div className="space-y-1">
            {items.map((it, i) => (
              <Link key={i} href={linkFor(it)} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition ${it.done ? "text-slate-400" : "hover:bg-slate-50"}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${it.done ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300"}`}>{it.done ? "✓" : i + 1}</span>
                <span className={it.done ? "line-through" : "font-medium"}><MD inline>{labelFor(it)}</MD></span>
              </Link>
            ))}
          </div>
        )}
        {taskSubs && taskSubs.length > 0 && (
          <div className="mt-1 space-y-1">
            {taskSubs.map((tk) => (
              <a key={"tk" + tk.taskId} href={`/tasks?task=${tk.taskId}`} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition ${tk.complete ? "text-slate-400" : "hover:bg-slate-50"}`}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs ${tk.complete ? "border-teal-500 bg-teal-500 text-white" : "border-teal-300 text-teal-600"}`}>{tk.complete ? "✓" : "🛠"}</span>
                <span className="min-w-0 flex-1">
                  <span className={tk.complete ? "line-through" : "font-medium"}>{tk.title}</span>
                  <span className="ml-1.5 whitespace-nowrap rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">{t("作业")}</span>
                  {tk.due ? <span className="ml-1 whitespace-nowrap text-[11px] text-[#a98b52]">⏳{t("截止")} {tk.due.slice(5)}</span> : null}
                </span>
                <span className="shrink-0 text-[11px] text-teal-600">{tk.complete ? t("已完成") : (tk.total ? `${tk.done}/${tk.total}` : t("待做"))}</span>
              </a>
            ))}
          </div>
        )}
        {crossUrgent.length > 0 && (
          <div className="mt-3 border-t border-[#e7d9b6] pt-3">
            <div className="mb-1.5 text-xs font-semibold text-rose-700">⚠️ {t("别的科目快到期/逾期")}</div>
            <div className="space-y-1">
              {crossUrgent.map((u) => (
                <a key={u.taskId} href={`/tasks?task=${u.taskId}`} className="flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition hover:bg-slate-50">
                  <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " + (u.overdue ? "bg-rose-100 text-rose-700 ring-rose-300" : "bg-amber-100 text-amber-800 ring-amber-300")}>{u.overdue ? t("已逾期") : t("快到期")}</span>
                  <span className="min-w-0 flex-1 truncate"><span className="text-[#8a6a2c]">{u.examName} · </span><span className="font-medium text-[#2f2413]">{u.title}</span></span>
                  <span className="shrink-0 text-[11px] text-[#a98b52]">⏳{u.due.slice(5)}</span>
                </a>
              ))}
            </div>
          </div>
        )}
        {firstUndone && <Link href={linkFor(firstUndone)} className="btn mt-3 w-full">▶ {t("开始:")}<MD inline>{labelFor(firstUndone)}</MD></Link>}
        {daily?.fallback && daily.fallback.remaining > 0 && (
          <Link href={linkFor(daily.fallback.item)} className="mt-2 block rounded-xl bg-[#f3ecda] px-3 py-2 text-xs text-[#6b4a25] ring-1 ring-[#e4d5af] hover:brightness-95">
            🛟 {t("今天真没时间?至少做这一件保底,其余明天顺延:")}<span className="font-semibold"><MD inline>{labelFor(daily.fallback.item)}</MD></span>
          </Link>
        )}
        {daily?.practical && daily.practical.generating && (
          <div className="mt-2 block rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-800 ring-1 ring-teal-200">
            🛠️ {t("正在给你布置一个实践作业…")}
          </div>
        )}
      </div>
      </Editable>
      )}

      {/* 拖进「首页大模块」的功能 —— 用 Style-A 富模块渲染,并作为可摆放的布局块 */}
      {zoneModules.map((it) => (
        <Editable key={"feat:" + it.id} id={"feat:" + it.id}><FeatureModule item={it} /></Editable>
      ))}

      {/* feature grid —— 按放置表渲染;未激活则回退当前 features */}
      <Editable id="more"><>
      {gridCards.length > 0 && <>
      <h2 className="mt-6 mb-2 text-sm font-semibold text-[#e8c987]">{t("更多功能")}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {gridCards.map((f, i) => (
          <Link key={f.href} href={f.href} className={`group relative rounded-3xl border border-[#e4d5af] bg-[#f5eed6] p-4 shadow-sm text-[#2f2413] transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${f.tint || "hover:border-amber-300"} animate-in d${(i % 5) + 1} flex flex-col`}>
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"><div className={`absolute -right-6 -top-6 h-16 w-16 rounded-full bg-gradient-to-br ${f.grad || "from-amber-400 to-orange-500"} opacity-10 blur-xl transition-opacity group-hover:opacity-25`} /></div>
            <div className={`relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${f.ig || "from-amber-50 to-orange-50"} text-xl shadow-inner`}>{f.icon}</div>
            {f.href === "/inbox" && unread > 0 && <span className="absolute right-3 top-3 grid h-5 min-w-[20px] place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{unread}</span>}
            <FitText className="relative mt-2 w-full font-semibold text-[#2f2413]" max={16} min={11} lines={2} title={f.title}>{f.title}</FitText>
            <FitText className="relative w-full text-slate-500" max={12} min={9} lines={2} title={f.desc}>{f.desc}</FitText>
            <div className={`relative mt-2 h-1 w-8 rounded-full bg-gradient-to-r ${f.grad || "from-amber-400 to-orange-500"} opacity-70`} />
          </Link>
        ))}
      </div>
      </>}
      </></Editable>

      {/* AI strategy */}
      {nativeShown("strategy") && (
      <Editable id="strategy">
      <div className="card animate-in mt-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-sm">🎯 {t("AI 策略建议")}</h2>
            <p className="text-xs text-slate-400">{t("AI 读你的进度,给出该补哪、该省哪的建议")}</p>
          </div>
          {!sugg && <button className="btn-ghost py-2 text-xs" onClick={loadSugg} disabled={suggBusy}>{suggBusy ? t("分析中…") : t("看看我的进度建议")}</button>}
        </div>
        {sugg?.none && <p className="mt-2 text-sm text-slate-400">{t("先做一些练习,AI 才能根据你的表现给建议。")}</p>}
        {sugg?.adopted && <p className="mt-2 text-sm text-amber-700">{t("已采纳,备考策略已更新 ✓")}</p>}
        {sugg?.suggestions && (
          <div className="mt-2 space-y-2">
            <ul className="list-disc pl-5 text-sm text-slate-600">{sugg.suggestions.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <button className="btn w-full py-2 text-sm" onClick={adopt}>{t("采纳并更新备考策略")}</button>
          </div>
        )}
      </div>
      </Editable>
      )}

      {stats.matCount === 0 && (
        <Editable id="matwarn">
        <Link href="/materials" className="card animate-in mt-4 block border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">⚠️ {t("⚠️ 资料库还是空的,AI 只能凭记忆讲课,准确性没保障。")}<b>{t("强烈建议先上传资料")}</b></p>
        </Link>
        </Editable>
      )}
      </LayoutLab>
    </>
  );
}
