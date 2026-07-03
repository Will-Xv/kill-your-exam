"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";
import { useAiFetch } from "@/components/AiErrorDialog";
import { useI18n } from "@/components/I18n";
import { LANGS } from "@/lib/translations";

export default function Settings() {
  const t = useT();
  const aiFetch = useAiFetch();
  const { lang, setLang } = useI18n();
  const [info, setInfo] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [ingestToken, setIngestToken] = useState("");

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => { setInfo(d); setModel(d.model); });
    fetch("/api/ingest/token").then((r) => r.json()).then((d) => setIngestToken(d.token || ""));
  }, []);
  async function resetIngest() {
    const d = await fetch("/api/ingest/token", { method: "POST" }).then((r) => r.json());
    setIngestToken(d.token || "");
  }

  async function save() {
    setBusy(true); setMsg("");
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: apiKey || undefined, model }) });
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
              className={`rounded-full border px-4 py-1.5 text-sm ${lang === code ? "border-emerald-600 bg-emerald-50 text-emerald-700 font-medium" : "border-stone-300 text-stone-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="card flex items-center justify-between">
        <p className="text-sm">{t("当前账号:")}<b>{info.username}</b>{info.isAdmin ? t("(管理员)") : ""}</p>
        <div className="flex gap-3 items-center">
          {info.isAdmin && <a className="text-sm text-emerald-700 font-medium" href="/admin">{t("管理面板")}</a>}
          <button className="text-sm text-stone-400 underline" onClick={logout}>{t("退出登录")}</button>
        </div>
      </div>
      {info.isAdmin && <div className="card space-y-3">
        <h2 className="font-semibold">{t("AI 服务(Gemini)")}</h2>
        <p className="text-sm text-stone-500">{info.hasKey ? `${t("已配置密钥(尾号")} ${info.keyTail})` : t("⚠️ 还没有配置 API 密钥,网站的 AI 功能无法使用")}</p>
        <input className="input" type="password" placeholder={info.hasKey ? t("粘贴新密钥可替换(留空则不变)") : t("粘贴 Gemini API 密钥")} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <div>
          <label className="text-sm text-stone-500">{t("模型名称")}</label>
          <input className="input mt-1" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={save} disabled={busy}>{t("保存")}</button>
          <button className="btn-ghost" onClick={test} disabled={busy || !info.hasKey}>{t("测试连接")}</button>
        </div>
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      </div>}
      <div className="card space-y-2">
        <h2 className="font-semibold">{t("浏览器采集令牌")}</h2>
        <p className="text-xs text-stone-500">{t("配合 Chrome 采集扩展使用,把网页资料一键采进当前考试。把下面的令牌粘贴到扩展里。")}</p>
        <input className="input font-mono text-xs" readOnly value={ingestToken} onClick={(e) => e.target.select()} />
        <button className="btn-ghost text-sm py-2" onClick={resetIngest}>{t("重置令牌")}</button>
      </div>
      <div className="card space-y-2">
        <h2 className="font-semibold">{t("数据导出")}</h2>
        <p className="text-xs text-stone-500">{t("下载你的全部备考数据(JSON),随时备份。")}</p>
        <a className="btn-ghost text-sm py-2 inline-block" href="/api/export">{t("导出我的数据")}</a>
      </div>
      <div className="card text-sm text-stone-500 space-y-1">
        <p>{t("遇到任何解决不了的问题,直接联系 Will:")}</p>
        <a className="text-emerald-700 font-medium" href="mailto:xuy413682@gmail.com">xuy413682@gmail.com</a>
      </div>
    </div>
  );
}
