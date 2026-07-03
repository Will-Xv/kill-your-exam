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
      icon: "👋", title: t("欢迎使用 ExamPrep AI"),
      body: t("这是你的私人 AI 备考助手。先花 10 秒了解一下,再开始。"),
      lang: true
    },
    { icon: "📚", title: t("第一步:给它资料"), body: t("在「资料」页上传大纲、教材、真题(PDF/Word/图片都行),或用浏览器扩展从网页采集。资料越全,AI 越靠谱。") },
    { icon: "📖", title: t("第二步:学与练"), body: t("「学习」看 AI 讲知识点,「练习」做题即时批改,做错的自动进「错题本」按科学间隔重练。") },
    { icon: "📊", title: t("随时看进度"), body: t("「今天」页有每日任务,「掌握度」一眼看出强弱,「模拟考」做全真限时卷。有想法直接找「AI 助手」聊。") },
    { icon: "🔑", title: t("最后:填 AI 密钥"), body: t("首次使用要在「设置」页填入 AI 密钥,功能才能用。(管理员操作)") }
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
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 text-4xl">{s.icon}</div>
        <h2 className="mt-4 text-xl font-black">{s.title}</h2>
        <p className="mt-2 text-slate-600">{s.body}</p>

        {s.lang && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-slate-400">🌐 {t("可随时切换语言:")}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {LANGS.map(([code, label]) => (
                <button key={code} onClick={() => setLang(code)}
                  className={`rounded-full border px-3 py-1 text-xs ${lang === code ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold" : "border-slate-200 text-slate-500"}`}>{label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-1.5">
          {steps.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-emerald-500" : "w-1.5 bg-slate-200"}`} />)}
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
