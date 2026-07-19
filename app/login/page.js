"use client";
import { useState, useEffect } from "react";
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
  const [isCN, setIsCN] = useState(false); // 来访 IP 在中国大陆:隐藏用不了的 Google 登录

  useEffect(() => { fetch("/api/geo").then((r) => r.json()).then((d) => setIsCN(!!d.cn)).catch(() => {}); }, []);
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get("expired")) setErr(t("登录状态已过期,请重新登录。")); } catch {}
  }, []);
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("err");
    if (!e) return;
    const map = {
      google_state: t("Google 登录会话失效,请重试"),
      google_exchange: t("Google 登录失败,请重试"),
      google_denied: t("你取消了 Google 授权"),
      google_not_configured: t("Google 登录还没配置好"),
      account_deleted: t("该账号已被删除"),
    };
    setErr(map[e] || t("Google 登录出错,请重试"));
  }, []);

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
      <div className="blob absolute -top-32 -left-24 h-96 w-96 rounded-full bg-amber-500/25 blur-3xl" />
      <div className="blob absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-amber-500/25 blur-3xl" style={{ animationDelay: "5s" }} />

      {/* top nav */}
      <div className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 border border-white/20">📘</span>
          <span>Kill Your <span className="text-amber-500">Exam</span></span>
        </div>
        <select value={lang} onChange={(e) => setLang(e.target.value)}
          className="rounded-xl bg-white/10 border border-white/20 backdrop-blur px-3 py-2 text-sm text-white focus:outline-none [&>option]:text-slate-800">
          {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </div>

      {/* hero + form */}
      <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-6 pt-6 md:grid-cols-2 md:px-12 md:pt-16">
        <div className="animate-in">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-medium text-amber-400">✨ {t("你的私人 AI 备考教练")}</p>
          <h1 className="font-hero text-5xl leading-tight tracking-tight md:text-7xl">
            {t("任何考试,")}<br /><span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">{t("轻松通过。")}</span>
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
            <button type="button" onClick={() => setTab("login")} className={`flex-1 rounded-xl py-2.5 font-medium transition ${tab === "login" ? "bg-white shadow text-amber-700" : "text-slate-500"}`}>{t("登录")}</button>
            <button type="button" onClick={() => setTab("register")} className={`flex-1 rounded-xl py-2.5 font-medium transition ${tab === "register" ? "bg-white shadow text-amber-700" : "text-slate-500"}`}>{t("注册")}</button>
          </div>
          <div className="space-y-3">
            <input className="input" placeholder={t("用户名")} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            <input className="input" type="password" placeholder={tab === "register" ? t("设置密码(至少 6 位)") : t("密码")} value={password} onChange={(e) => setPassword(e.target.value)} />
            {tab === "register" && <input className="input" placeholder={t("邀请码(问 Will 要)")} value={invite} onChange={(e) => setInvite(e.target.value)} />}
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button className="btn w-full" disabled={busy || !username || !password}>{busy ? "…" : tab === "login" ? t("登录") : t("注册并进入")}</button>
            {!isCN && (
              <>
                <div className="flex items-center gap-3 py-1 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />{t("或")}<span className="h-px flex-1 bg-slate-200" /></div>
                <a href="/api/auth/google/start" className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-2.5 font-medium text-slate-700 transition hover:bg-slate-50">
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.2 13.2 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.5z"/><path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.1-5.5c-2 1.3-4.5 2.1-8.4 2.1-6.4 0-11.8-3.7-13.6-8.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/></svg>
                  {t("用 Google 继续")}
                </a>
              </>
            )}
            {isCN && <p className="text-center text-[11px] leading-snug text-slate-400">{t("检测到你在中国大陆,已隐藏无法使用的 Google 登录。请用上方的用户名 + 密码注册/登录。")}</p>}
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">{t("登录一次,这台设备一年内免登录")}</p>
          <p className="mt-2 text-center text-xs"><a href="/welcome" className="text-amber-600 underline">{t("了解这个网站能做什么 →")}</a></p>
        </form>
      </div>
    </div>
  );
}
