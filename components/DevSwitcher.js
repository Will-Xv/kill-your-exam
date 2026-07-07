"use client";
import { useEffect, useState } from "react";

export default function DevSwitcher({ t }) {
  const [accts, setAccts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    fetch("/api/dev/switch").then((r) => (r.ok ? r.json() : null)).then((d) => d && setAccts(d.accounts)).catch(() => {});
  }, []);
  async function switchTo(id) {
    setBusy(true);
    try {
      const r = await fetch("/api/dev/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toUserId: id }) });
      if (r.ok) { window.location.href = "/"; return; }
    } catch {}
    setBusy(false);
  }
  async function selftest(kind) {
    setMsg("");
    try {
      const r = await fetch("/api/taunt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "selftest", reply: kind }) });
      setMsg(r.ok ? t("已发送,几秒后会弹出") : "error");
    } catch { setMsg("error"); }
  }
  if (!accts) return null;
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">🔀 {t("快速切换账号")}</h2>
      <p className="text-xs text-stone-500">{t("在你的管理员/开发者账号之间一键切换,方便自测。")}</p>
      <div className="flex flex-wrap gap-2">
        {accts.map((a) => (
          <button key={a.id} disabled={a.current || busy} onClick={() => switchTo(a.id)}
            className={`rounded-xl px-3 py-2 text-sm ${a.current ? "bg-amber-200 text-amber-900 font-bold" : "bg-stone-100 hover:bg-stone-200"}`}>
            {a.username} {a.isAdmin ? "👑" : ""}{a.isDeveloper ? "🛠️" : ""}{a.current ? ` · ${t("当前")}` : ""}
          </button>
        ))}
      </div>
      <div className="border-t border-stone-100 pt-3 space-y-2">
        <h3 className="text-sm font-semibold">🗡️ {t("测试嘲讽弹窗")}</h3>
        <p className="text-xs text-stone-500">{t("给自己发一条,用来测试弹窗效果(开发者专用)。")}</p>
        <div className="flex gap-2">
          <button className="btn py-2 text-sm" onClick={() => selftest("taunt")}>🗡️ {t("嘲讽自己")}</button>
          <button className="btn-ghost py-2 text-sm" onClick={() => selftest("disdain")}>😒 {t("不屑自己")}</button>
        </div>
        {msg && <p className="text-xs text-amber-700">{msg}</p>}
      </div>
    </div>
  );
}
