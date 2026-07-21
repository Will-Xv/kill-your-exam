"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT, useI18n } from "@/components/I18n";
import { LANGS } from "@/lib/translations";
import { WHATS_NEW } from "@/lib/guide";

// 服务端按【用户账号】记录:是否过了新手导引(onboarded)、看过到第几版更新导引(guide_version)。
// 新用户 → 新手导引;老用户(已过导引)且有更新 → 只看【最新一次】的更新导引一次。不再依赖 localStorage,更新也不会重弹新手导引。
export default function Tour() {
  const t = useT();
  const { lang, setLang } = useI18n();
  const [mode, setMode] = useState(null); // 'tour' | 'whatsnew' | null
  const [hasExam, setHasExam] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let dead = false;
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (dead || !d?.user) return;
      const u = d.user;
      setHasExam(!!u.hasExam);
      if (!u.onboarded && !u.hasExam) setMode("tour");
      else if ((u.guideVersion || 0) < (u.guideCurrent || 0)) setMode("whatsnew");
    }).catch(() => {});
    return () => { dead = true; };
  }, []);

  if (!mode) return null;

  const tourSteps = [
    { icon: "🎯", title: t("欢迎使用 Kill Your Exam"), body: t("把每一场考试当成猎物。这是你的私人 AI 备考助手,先花 20 秒认认路。"), lang: true },
    { icon: "🗡️", title: t("先锁定目标"), body: t("在「追杀计划」里新建考试(选类型;只想学知识、不考试就选「只学习」)。建好后 AI 会先做认知自评,再让你在「补充资料」补充资料/回答问题(拖拽、粘贴都行)。") },
    { icon: "📖", title: t("学 + 练"), body: t("「学习」在首页「更多功能」里,看 AI 讲知识点并开始练习,做题即时批改;答错的自动进「错题本」按 1/3/7/15/30 天重练;练习优先用真题/网上题,没有才 AI 出题。") },
    { icon: "💬", title: t("问问杀手:你的 AI 助手"), body: t("有问题直接聊。它什么都能看、也能帮你改。所有对话都能传文件、拖拽或粘贴截图。") },
    { icon: "🧭", title: t("越用越懂你"), body: t("「你的全部杀技」是跨所有考试的长期画像,每个考试都会读它,做题多了自动更新。想留的题和心得放「笔记本」;「屠杀准备」考前再看;右下角随时能「意见反馈」。") }
  ];
  const whatsnewSteps = WHATS_NEW.map((x) => ({ icon: x.icon, title: t(x.title), body: t(x.body) }));
  const steps = mode === "tour" ? tourSteps : whatsnewSteps;
  const s = steps[step] || steps[0];
  const last = step === steps.length - 1;

  function done(redirect, read) {
    fetch("/api/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: mode, read }) }).catch(() => {});
    setMode(null);
    if (redirect) location.href = "/"; // 手动建考试已删除:导引结束直接回首页(空状态),让主人直接跟杀手说要考什么
  }
  function next() { if (last) done(mode === "tour" && !hasExam, true); else setStep(step + 1); }
  function skip() { done(false, false); }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="animate-in w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
        {mode === "whatsnew" && <p className="mb-1 text-xs font-bold tracking-wide text-amber-600">✨ {t("新功能上线")}</p>}
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-50 to-amber-50 text-4xl">{s.icon}</div>
        <h2 className="mt-4 text-xl font-black">{s.title}</h2>
        <p className="mt-2 text-slate-600">{s.body}</p>

        {s.lang && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-slate-400">🌐 {t("可随时切换语言:")}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {LANGS.map(([code, label]) => (
                <button key={code} onClick={() => setLang(code)}
                  className={`rounded-full border px-3 py-1 text-xs ${lang === code ? "border-amber-500 bg-amber-50 text-amber-700 font-semibold" : "border-slate-200 text-slate-500"}`}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5">
          {steps.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-amber-500" : "w-1.5 bg-slate-200"}`} />)}
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={skip} className="btn-ghost flex-1 py-2.5 text-sm">{t("跳过")}</button>
          <button onClick={next} className="btn flex-1 py-2.5 text-sm">{last ? (mode === "tour" ? t("开始使用") : t("知道了")) : t("下一步")}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
