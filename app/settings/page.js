"use client";
import { useEffect, useState } from "react";
import { useAiFetch } from "@/components/AiErrorDialog";

export default function Settings() {
  const aiFetch = useAiFetch();
  const [info, setInfo] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then((d) => { setInfo(d); setModel(d.model); }); }, []);

  async function save() {
    setBusy(true); setMsg("");
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: apiKey || undefined, model }) });
    setApiKey("");
    const d = await fetch("/api/settings").then((r) => r.json());
    setInfo(d); setMsg("已保存 ✓"); setBusy(false);
  }
  async function test() {
    setBusy(true); setMsg("测试中…");
    try {
      const d = await aiFetch("/api/settings/test", { method: "POST" });
      setMsg(`连接正常 ✓ (模型 ${d.model})`);
    } catch { setMsg(""); }
    setBusy(false);
  }
  if (!info) return <p className="mt-10 text-center text-stone-400">加载中…</p>;
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">设置</h1>
      <div className="card space-y-3">
        <h2 className="font-semibold">AI 服务(Gemini)</h2>
        <p className="text-sm text-stone-500">{info.hasKey ? `已配置密钥(尾号 ${info.keyTail})` : "⚠️ 还没有配置 API 密钥,网站的 AI 功能无法使用"}</p>
        <input className="input" type="password" placeholder={info.hasKey ? "粘贴新密钥可替换(留空则不变)" : "粘贴 Gemini API 密钥"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <div>
          <label className="text-sm text-stone-500">模型名称</label>
          <input className="input mt-1" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={save} disabled={busy}>保存</button>
          <button className="btn-ghost" onClick={test} disabled={busy || !info.hasKey}>测试连接</button>
        </div>
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      </div>
      <div className="card text-sm text-stone-500 space-y-1">
        <p>遇到任何解决不了的问题,直接联系 Will:</p>
        <a className="text-emerald-700 font-medium" href="mailto:xuy413682@gmail.com">xuy413682@gmail.com</a>
      </div>
    </div>
  );
}
