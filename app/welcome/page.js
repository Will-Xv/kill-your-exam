"use client";
import { useEffect } from "react";

const FEATURES = [
  { icon: "🗡️", title: "追杀计划", desc: "把每一场考试当猎物。多门考试统一管理、一键切换,倒计时和进度一目了然。", grad: "from-emerald-400/20 to-teal-500/20" },
  { icon: "📖", title: "学习 + 练习", desc: "AI 依据你上传的资料讲知识点,做题即时批改;答错的自动进错题本,按 1/3/7/15/30 天科学重练。", grad: "from-teal-400/20 to-cyan-500/20" },
  { icon: "💬", title: "问问杀手", desc: "你的 AI 助手,什么都能看、也能帮你改(改前先征求你同意),还能指挥浏览器扩展去已登录的网站采集资料。", grad: "from-cyan-400/20 to-sky-500/20" },
  { icon: "🧭", title: "你的全部杀技", desc: "一份跨所有考试的长期画像,越用越懂你;每一门考试都会读它,从而了解你的整体强弱和习惯。", grad: "from-sky-400/20 to-emerald-500/20" },
  { icon: "🎒", title: "屠杀准备 · 模拟考", desc: "考前带什么、考场规则、心态提醒,加限时全真模拟卷和成绩报告,临阵不慌。", grad: "from-emerald-400/20 to-lime-500/20" },
  { icon: "📚", title: "资料库 · RAG", desc: "上传 PDF / Word / 图片,或用扩展从网页采集;讲解和出题都基于你自己的资料,尽量不瞎编。", grad: "from-teal-400/20 to-emerald-500/20" },
  { icon: "📓", title: "笔记本", desc: "把想留的题一键收藏、随手记心得,AI 也能读到,复习时一处翻看。", grad: "from-cyan-400/20 to-teal-500/20" },
  { icon: "🌐", title: "7 种语言 · Google 登录", desc: "中/英/法/西/俄/阿/印尼随时切换,支持用 Google 一键登录或绑定已有账号。", grad: "from-sky-400/20 to-cyan-500/20" },
];

const STEPS = [
  { n: "1", t: "建考试", d: "选类型、填名字(只想学不考试也行),AI 先联网做认知自评。" },
  { n: "2", t: "喂资料", d: "上传大纲教材真题,或让扩展从网页采集进资料库。" },
  { n: "3", t: "开杀", d: "学知识、练真题、问问杀手,进度自动追踪、策略自动调整。" },
];

export default function Welcome() {
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")), { threshold: 0.12 });
    document.querySelectorAll(".kye-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#04201f] text-white">
      {/* animated background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="kye-blob h-96 w-96 bg-emerald-500/40" style={{ top: "-6rem", left: "-4rem", animation: "kyeFloat 11s ease-in-out infinite" }} />
        <div className="kye-blob h-[28rem] w-[28rem] bg-cyan-500/30" style={{ top: "20%", right: "-8rem", animation: "kyeDrift 14s ease-in-out infinite" }} />
        <div className="kye-blob h-80 w-80 bg-teal-400/30" style={{ bottom: "-6rem", left: "30%", animation: "kyeFloat2 13s ease-in-out infinite" }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(45,212,191,.18),transparent_60%)]" />
      </div>

      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-xl font-black">📘 Kill Your <span className="text-emerald-300">Exam</span></div>
        <a href="/" className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20">进入应用 →</a>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 text-center md:pt-24">
        <p className="kye-reveal mx-auto mb-5 w-fit rounded-full bg-white/10 px-4 py-1.5 text-sm text-emerald-200 ring-1 ring-white/15">✨ 你的私人 AI 备考教练</p>
        <h1 className="kye-reveal font-hero text-6xl leading-[1.05] tracking-tight md:text-8xl">
          任何考试,<br /><span className="kye-gradtext">轻松通过。</span>
        </h1>
        <p className="kye-reveal mx-auto mt-7 max-w-2xl text-lg text-slate-300 md:text-xl">
          上传你的资料,AI 讲知识点、出练习题、盯进度、排计划——把每一场考试当成猎物,像请了个 24 小时私教。
        </p>
        <div className="kye-reveal mt-10 flex flex-wrap items-center justify-center gap-4">
          <a href="/" className="group rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 px-8 py-4 text-lg font-bold text-emerald-950 shadow-xl shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:shadow-2xl">
            立即开始 <span className="inline-block transition group-hover:translate-x-1">→</span>
          </a>
          <a href="#features" className="rounded-2xl px-8 py-4 text-lg font-semibold text-slate-200 ring-1 ring-white/20 transition hover:bg-white/10">看看功能 ↓</a>
        </div>
        <div className="kye-reveal mx-auto mt-14 grid max-w-xl grid-cols-3 gap-4 text-center">
          {[["7", "种语言"], ["100%", "基于你的资料"], ["24/7", "随时可用"]].map(([a, b]) => (
            <div key={b} className="rounded-2xl bg-white/5 py-4 ring-1 ring-white/10">
              <div className="font-hero text-3xl">{a}</div><div className="mt-1 text-xs text-slate-400">{b}</div>
            </div>
          ))}
        </div>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="kye-reveal font-hero text-center text-4xl md:text-5xl">它能替你做的事</h2>
        <p className="kye-reveal mx-auto mt-3 max-w-xl text-center text-slate-400">一整套备考闭环,从建考试到临考冲刺。</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`kye-reveal kye-card rounded-3xl bg-gradient-to-br ${f.grad} p-6 ring-1 ring-white/10 backdrop-blur`} style={{ transitionDelay: `${(i % 3) * 80}ms` }}>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-3xl ring-1 ring-white/15">{f.icon}</div>
              <h3 className="mt-4 text-xl font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="kye-reveal font-hero text-center text-4xl md:text-5xl">三步开杀</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="kye-reveal relative rounded-3xl bg-white/5 p-8 ring-1 ring-white/10" style={{ transitionDelay: `${i * 100}ms` }}>
              <div className="font-hero text-6xl text-emerald-300/40">{s.n}</div>
              <h3 className="mt-2 text-2xl font-bold">{s.t}</h3>
              <p className="mt-2 text-slate-300">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="kye-reveal rounded-[2rem] bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 p-12 ring-1 ring-white/15 backdrop-blur">
          <h2 className="font-hero text-4xl md:text-6xl">准备好干掉下一场考试了吗?</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">花 5 分钟建好考试,今天就开始。</p>
          <a href="/" className="mt-8 inline-block rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 px-10 py-4 text-lg font-bold text-emerald-950 shadow-xl shadow-emerald-500/30 transition hover:-translate-y-0.5">立即进入 →</a>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-center text-sm text-slate-500">
        © 2026 Kill Your Exam · <a href="/privacy" className="underline hover:text-slate-300">隐私政策</a> · <a href="/" className="underline hover:text-slate-300">进入应用</a>
      </footer>
    </div>
  );
}
