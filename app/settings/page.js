"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";
import { useAiFetch } from "@/components/AiErrorDialog";
import { useI18n } from "@/components/I18n";
import { LANGS } from "@/lib/translations";
import NotifSettings from "@/components/NotifSettings";

export default function Settings() {
  const t = useT();
  const aiFetch = useAiFetch();
  const { lang, setLang } = useI18n();
  const [info, setInfo] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [j0url, setJ0url] = useState("");
  const [j0key, setJ0key] = useState("");
  const [j0msg, setJ0msg] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [ingestToken, setIngestToken] = useState("");
  const [school, setSchool] = useState("");
  const [profileMsg, setProfileMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => { setInfo(d); setModel(d.model); setJ0url(d.judge0Url || ""); });
    fetch("/api/ingest/token").then((r) => r.json()).then((d) => setIngestToken(d.token || ""));
    fetch("/api/profile").then((r) => r.json()).then((d) => setSchool(d.profile?.school || ""));
  }, []);
  async function saveProfile() {
    await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: { school } }) });
    setProfileMsg(t("已保存 ✓"));
  }
  async function resetIngest() {
    const d = await fetch("/api/ingest/token", { method: "POST" }).then((r) => r.json());
    setIngestToken(d.token || "");
  }

  async function save() {
    setBusy(true); setMsg("");
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: apiKey || undefined, model, judge0Url: j0url, judge0Key: j0key || undefined }) });
    setJ0key("");
    setApiKey("");
    const d = await fetch("/api/settings").then((r) => r.json());
    setInfo(d); setMsg(t("已保存 ✓")); setBusy(false);
  }
  async function test() {
    setBusy(true); setMsg(t("测试中…"));
    try {
      const d = await aiFetch("/api/settings/test", { method: "POST" });
      setMsg(`${t("连接正常 ✓")} ${d.model}`);
    } catch { setMsg(""); }
    setBusy(false);
  }
  async function testJudge0() {
    setJ0msg(t("测试中…"));
    try {
      const d = await fetch("/api/settings/judge0-test", { method: "POST" }).then((r) => r.json());
      if (d.ok) setJ0msg(`${t("Judge0 连接正常 ✓")}${d.stdout ? " (" + d.stdout + ")" : ""}`);
      else if (d.reason === "no_url") setJ0msg(t("还没填 Judge0 地址"));
      else setJ0msg(`${t("Judge0 连接失败")}: ${d.reason || ""}${d.detail ? " · " + String(d.detail).slice(0, 120) : ""}`);
    } catch { setJ0msg(t("Judge0 连接失败")); }
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.href = "/login";
  }
  if (!info) return <p className="mt-10 text-center text-stone-400">{t("加载中…")}</p>;
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">{t("设置")}</h1>
      <div className="card">
        <label className="text-sm text-stone-500">{t("界面语言")} / Language</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {LANGS.map(([code, label]) => (
            <button key={code} onClick={() => setLang(code)}
              className={`rounded-full border px-4 py-1.5 text-sm ${lang === code ? "border-amber-600 bg-amber-50 text-amber-700 font-medium" : "border-stone-300 text-stone-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <NotifSettings />
      <div className="card flex items-center justify-between">
        <p className="text-sm">{t("当前账号:")}<b>{info.username}</b>{info.isAdmin ? t("(管理员)") : ""}</p>
        <div className="flex gap-3 items-center">
          {info.isAdmin && <a className="text-sm text-amber-700 font-medium" href="/admin">{t("管理面板")}</a>}
          {info.isDeveloper && <a className="text-sm text-indigo-600 font-medium" href="/dev">{t("开发者工具")}</a>}
          <button className="text-sm text-stone-400 underline" onClick={logout}>{t("退出登录")}</button>
        </div>
      </div>
      {info.googleAvailable && (
        <div className="card flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{t("Google 账号")}</h2>
            <p className="text-xs text-stone-400">{info.googleLinked ? (t("已绑定") + (info.email ? " · " + info.email : "")) : t("绑定后可以用 Google 一键登录")}</p>
          </div>
          {info.googleLinked
            ? <span className="text-sm text-amber-700">✓ {t("已绑定")}</span>
            : <a href="/api/auth/google/start?bind=1" className="btn-ghost text-sm py-2">{t("绑定 Google")}</a>}
        </div>
      )}
      {info.isAdmin && <div className="card space-y-3">
        <h2 className="font-semibold">{t("AI 服务(Gemini)")}</h2>
        <p className="text-sm text-stone-500">{info.hasKey ? `${t("已配置密钥(尾号")} ${info.keyTail})` : t("⚠️ 还没有配置 API 密钥,网站的 AI 功能无法使用")}</p>
        <input className="input" type="password" placeholder={info.hasKey ? t("粘贴新密钥可替换(留空则不变)") : t("粘贴 Gemini API 密钥")} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <div>
          <label className="text-sm text-stone-500">{t("模型名称")}</label>
          <input className="input mt-1" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={save} disabled={busy}>{t("保存")}</button>
          <button className="btn-ghost" onClick={test} disabled={busy || !info.hasKey}>{t("测试AI的API")}</button>
          {msg && <span className="text-sm text-amber-700">{msg}</span>}
        </div>
        <div className="border-t border-stone-100 pt-3">
          <label className="text-sm font-medium text-stone-600">{t("代码执行(Judge0,用于实践任务判分)")}</label>
          <p className="text-xs text-stone-400 mt-0.5">{t("填了才能真正运行学生代码判分。可用 RapidAPI 上的 Judge0 CE,或自托管实例。留空则实践任务只用证据+AI审阅。")}</p>
          <input className="input mt-1" placeholder="https://judge0-ce.p.rapidapi.com" value={j0url} onChange={(e) => setJ0url(e.target.value)} />
          <input className="input mt-1" type="password" placeholder={info.judge0HasKey ? t("已配置 Judge0 密钥,粘贴可替换(留空不变)") : t("粘贴 Judge0 API 密钥(RapidAPI Key 或自托管 Token)")} value={j0key} onChange={(e) => setJ0key(e.target.value)} />
          <div className="mt-1 flex items-center gap-2">
            <button className="btn text-sm py-1" onClick={save} disabled={busy}>{t("保存")}</button>
            <button className="btn-ghost text-sm py-1" onClick={testJudge0} disabled={!info.judge0HasKey && !j0url}>{t("测试 Judge0")}</button>
            {j0msg && <span className="text-xs text-stone-600">{j0msg}</span>}
          </div>
          <p className="text-[11px] text-stone-400 mt-0.5">{t("先保存,再测试(会真跑一段代码验证地址/密钥/鉴权是否通)。")}</p>
        </div>
      </div>}
      <div className="card space-y-2">
        <h2 className="font-semibold">🏫 {t("我的档案")}</h2>
        <label className="text-xs text-slate-500">{t("学校/课程信息")}</label>
        <input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder={t("例如:XX大学 数据结构 期末考")} />
        <button className="btn-ghost text-sm py-2" onClick={saveProfile}>{t("保存")}</button>
        {profileMsg && <p className="text-sm text-amber-700">{profileMsg}</p>}
      </div>
      <a href="/collector" className="card card-hover flex items-center justify-between">
        <div>
          <h2 className="font-semibold">🧲 {t("浏览器采集扩展")}</h2>
          <p className="text-xs text-stone-500">{t("安装扩展、拿采集令牌,把网页资料采进资料库")}</p>
        </div>
        <span className="text-slate-300">→</span>
      </a>
      <div className="card space-y-2">
        <h2 className="font-semibold">{t("数据导出")}</h2>
        <p className="text-xs text-stone-500">{t("下载你的全部备考数据(JSON),随时备份。")}</p>
        <a className="btn-ghost text-sm py-2 inline-block" href="/api/export">{t("导出我的数据")}</a>
      </div>
      <div className="card text-sm text-stone-500 space-y-1">
        <p>{t("遇到任何解决不了的问题,直接联系 Will:")}</p>
        <a className="text-amber-700 font-medium" href="mailto:xuy413682@gmail.com">xuy413682@gmail.com</a>
      </div>
    </div>
  );
}
