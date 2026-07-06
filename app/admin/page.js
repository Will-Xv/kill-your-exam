"use client";
import { useT } from "@/components/I18n";
import React, { useEffect, useState } from "react";

function DevAccount({ t }) {
  const [u, setU] = React.useState("");
  const [p, setP] = React.useState("");
  const [msg, setMsg] = React.useState("");
  async function create() {
    setMsg("");
    const r = await fetch("/api/admin/create-dev", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) });
    const d = await r.json();
    setMsg(r.ok ? t("开发者子账号已创建 ✓") : (d.error || "error"));
    if (r.ok) { setU(""); setP(""); }
  }
  return (
    <div className="card space-y-2">
      <h2 className="font-semibold">🛠️ {t("开发者子账号")}</h2>
      <p className="text-xs text-stone-500">{t("开发者子账号拥有 AI 密钥配置和调试工具。管理员本身只能看使用情况。")}</p>
      <div className="flex flex-wrap gap-2">
        <input className="input flex-1 min-w-[120px]" placeholder={t("用户名")} value={u} onChange={(e) => setU(e.target.value)} />
        <input className="input flex-1 min-w-[120px]" type="password" placeholder={t("密码")} value={p} onChange={(e) => setP(e.target.value)} />
        <button className="btn py-2 text-sm" onClick={create} disabled={!u || !p}>{t("创建")}</button>
      </div>
      {msg && <p className="text-sm text-amber-700">{msg}</p>}
    </div>
  );
}

// SQLite 的 created_at 是 UTC(无时区)。按 UTC 解析,再显示成浏览器本地时间,避免出现"未来时间"。
function fmtLocal(ts) {
  if (!ts) return "—";
  const d = new Date(String(ts).replace(" ", "T") + "Z");
  if (isNaN(d)) return String(ts).slice(5, 16);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Admin() {
  const t = useT();
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(false);
  const load = () => fetch("/api/admin/usage").then(async (r) => {
    if (!r.ok) { setDenied(true); return; }
    setData(await r.json());
  });
  useEffect(() => { load(); }, []);
  async function act(action, userId) {
    if (action === "delete" && !confirm(t("确定删除该账号?30 天内可恢复,30 天后永久清除。"))) return;
    await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId }) });
    load();
  }
  if (denied) return <p className="mt-16 text-center text-stone-400">{t("这个页面只有管理员能看。")}</p>;
  if (!data) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">{t("管理员 · 使用频率")}</h1>
      <p className="text-xs text-stone-400">{t("出于隐私考虑,这里只显示使用频率,看不到任何人的学习内容。")}</p>
      <DevAccount t={t} />
      {data.users.map((u) => (
        <div key={u.id} className="card">
          <div className="flex items-center justify-between">
            <p className="font-bold">
              {u.username} {u.isAdmin && <span className="badge-material">{t("管理员")}</span>}{u.isDeveloper && <span className="badge-model ml-1">🛠️ {t("开发者")}</span>}
              {u.deletedAt && <span className="badge-model">{t("已删除")} · {Math.max(0, 30 - Math.floor((Date.now() - new Date(u.deletedAt + "Z")) / 86400000))} {t("天后永久清除")}</span>}
            </p>
            <div className="flex items-center gap-3">
              <p className="text-xs text-stone-400">{t("注册于")} {u.createdAt?.slice(0, 10)}</p>
              {!u.isAdmin && !u.deletedAt && <button className="text-xs text-red-500 underline" onClick={() => act("delete", u.id)}>{t("删除账号")}</button>}
              {u.deletedAt && <button className="text-xs text-amber-600 underline" onClick={() => act("restore", u.id)}>{t("恢复账号")}</button>}
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
            <div><b>{u.attempts}</b><div className="text-xs text-stone-400">{t("总做题")}</div></div>
            <div><b>{u.activeDays}</b><div className="text-xs text-stone-400">{t("活跃天数")}</div></div>
            <div><b>{u.chats}</b><div className="text-xs text-stone-400">{t("聊天条数")}</div></div>
            <div><b className="text-xs">{fmtLocal(u.lastActive)}</b><div className="text-xs text-stone-400">{t("最近活跃")}</div></div>
          </div>
          {u.week.length > 0 && (
            <div className="mt-3 flex items-end gap-1 h-12">
              {u.week.map((d) => (
                <div key={d.d} className="flex-1 text-center">
                  <div className="mx-auto w-full max-w-8 rounded-t bg-amber-500" style={{ height: `${Math.min(100, d.n * 8)}%` }} title={`${d.d}: ${d.n} 题`} />
                  <div className="text-[9px] text-stone-400">{d.d.slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
