"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT, useI18n } from "@/components/I18n";
import { LANGS } from "@/lib/translations";

// 首次登录的欢迎导引。firstTime=true 时(还没设考试)也会引导去设置。
export default function Tour({ firstTime }) {
  const t = useT();
  const { lang, setLang } = useI18n();
  const [step, setStep] = useState(-1);
  useEffect(() => {
    const seen = typeof localStorage !== "undefined" && localStorage.getItem("beikao_tour_done");
    if (!seen) setStep(0);
  }, []);
  if (step < 0) return null;

  const steps = [
    {
      icon: "🎯", title: t("欢迎使用 Kill Your Exam"),
      body: t("把每一场考试当成猎物。这是你的私人 AI 备考助手,先花 20 秒认认路。"),
      lang: true
    },
    { icon: "🗡️", title: t("先锁定目标"), body: t("在「追杀计划」里新建考试(选类型;只想学知识、不考试就选「只学习」)。建好后 AI 会先做认知自评,再让你在「补充资料」补充资料/回答问题(也可用浏览器扩展从网页采集——拖拽、粘贴都行)。") },
    { icon: "📖", title: t("学 + 练"), body: t("「学习」看 AI 讲知识点并开始练习,做题即时批改;答错的自动进「错题本」按 1/3/7/15/30 天重练;练习优先用真题/网上题,没有才 AI 出题。") },
    { icon: "💬", title: t("问问杀手:你的 AI 助手"), body: t("有问题直接聊。它什么都能看、也能帮你改(改前会征求你同意),还能指挥浏览器扩展去网站采集。所有对话都能传文件、拖拽或粘贴截图。") },
    { icon: "🧭", title: t("越用越懂你"), body: t("「你的全部杀技」是跨所有考试的长期画像,每个考试都会读它,做题多了自动更新。想留的题和心得放「笔记本」;「屠杀准备」考前再看;右下角随时能「意见反馈」。") }
  ];
  const s = steps[step];
  const last = step === steps.length - 1;
  function next() {
    if (last) {
      localStorage.setItem("beikao_tour_done", "1");
      setStep(-1);
      if (firstTime) location.href = "/onboarding";
    } else setStep(step + 1);
  }
  function skip() { localStorage.setItem("beikao_tour_done", "1"); setStep(-1); }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="animate-in w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
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
          <button onClick={next} className="btn flex-1 py-2.5 text-sm">{last ? t("开始使用") : t("下一步")}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
