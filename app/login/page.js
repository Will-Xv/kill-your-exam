"use client";
import { useState } from "react";
import { useT, useI18n } from "@/components/I18n";
import { LANGS } from "@/lib/translations";

export default function Login() {
  const t = useT();
  const { lang, setLang } = useI18n();
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const url = tab === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = tab === "login" ? { username, password } : { username, password, invite };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { location.href = "/"; return; }
    const d = await res.json().catch(() => ({}));
    setErr(t(d.error || "出错了,再试一次")); setBusy(false);
  }

  return (
    <div className="grad-hero fixed inset-0 overflow-hidden text-white">
      {/* animated blobs */}
      <div className="blob absolute -top-32 -left-24 h-96 w-96 rounded-full bg-emerald-500/25 blur-3xl" />
      <div className="blob absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-cyan-500/25 blur-3xl" style={{ animationDelay: "5s" }} />

      {/* top nav */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 border border-white/20">📘</span>
          <span>Kill Your <span className="text-emerald-400">Exam</span></span>
        </div>
        <select value={lang} onChange={(e) => setLang(e.target.value)}
          className="rounded-xl bg-white/10 border border-white/20 backdrop-blur px-3 py-2 text-sm text-white focus:outline-none [&>option]:text-slate-800">
          {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </div>

      {/* hero + form */}
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-6 pt-6 md:grid-cols-2 md:px-12 md:pt-16">
        <div className="animate-in">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-medium text-emerald-300">✨ {t("你的私人 AI 备考教练")}</p>
          <h1 className="text-4xl font-black leading-tight tracking-tight md:text-6xl">
            {t("任何考试,")}<br /><span className="bg-gradient-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">{t("都能考好。")}</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-slate-300">{t("上传你的资料,AI 讲知识点、出练习题、盯进度、排计划——像请了个私教。")}</p>
          <div className="mt-8 hidden gap-6 text-sm text-slate-400 md:flex">
            <div><div className="text-2xl font-bold text-white">7</div>{t("种语言")}</div>
            <div><div className="text-2xl font-bold text-white">100%</div>{t("基于你的资料")}</div>
            <div><div className="text-2xl font-bold text-white">24/7</div>{t("随时可用")}</div>
          </div>
        </div>

        <form onSubmit={submit} className="glass animate-in d2 w-full max-w-sm justify-self-center rounded-3xl p-7 text-slate-800 shadow-2xl md:justify-self-end">
          <div className="mb-5 flex rounded-2xl bg-slate-100 p-1 text-sm">
            <button type="button" onClick={() => setTab("login")} className={`flex-1 rounded-xl py-2.5 font-medium transition ${tab === "login" ? "bg-white shadow text-emerald-700" : "text-slate-500"}`}>{t("登录")}</button>
            <button type="button" onClick={() => setTab("register")} className={`flex-1 rounded-xl py-2.5 font-medium transition ${tab === "register" ? "bg-white shadow text-emerald-700" : "text-slate-500"}`}>{t("注册")}</button>
          </div>
          <div className="space-y-3">
            <input className="input" placeholder={t("用户名")} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            <input className="input" type="password" placeholder={tab === "register" ? t("设置密码(至少 6 位)") : t("密码")} value={password} onChange={(e) => setPassword(e.target.value)} />
            {tab === "register" && <input className="input" placeholder={t("邀请码(问 Will 要)")} value={invite} onChange={(e) => setInvite(e.target.value)} />}
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button className="btn w-full" disabled={busy || !username || !password}>{busy ? "…" : tab === "login" ? t("登录") : t("注册并进入")}</button>
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">{t("登录一次,这台设备一年内免登录")}</p>
        </form>
      </div>
    </div>
  );
}
