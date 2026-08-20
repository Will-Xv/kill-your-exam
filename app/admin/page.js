"use client";
import { confirmDialog } from "@/components/ui/dialog";
import { useT } from "@/components/I18n";
import React, { useEffect, useState } from "react";
import DevSwitcher from "@/components/DevSwitcher";

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

// token 数字缩写:1234567 → 1.23M,便于在小卡片里横排
function fmtTok(n) {
  const v = Number(n || 0);
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(v);
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
    if (action === "delete" && !await confirmDialog(t("确定删除该账号?30 天内可恢复,30 天后永久清除。"))) return;
    await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, userId }) });
    load();
  }
  if (denied) return <p className="mt-16 text-center text-stone-400">{t("这个页面只有管理员能看。")}</p>;
  if (!data) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;
  return (
    <div className="space-y-4 md:mt-14">
      <h1 className="text-2xl font-bold">{t("管理员 · 使用频率")}</h1>
      <p className="text-xs text-stone-400">{t("出于隐私考虑,这里只显示使用频率,看不到任何人的学习内容。")}</p>
      <DevSwitcher t={t} />
      <DevAccount t={t} />
      {data.tokenAll && (
        <div className="card">
          <h2 className="font-bold text-sm">🔥 {t("Token 总消耗(全站)")}</h2>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-sm">
            <div><b>{fmtTok(data.tokenAll.total)}</b><div className="text-xs text-stone-400">{t("总计")}</div></div>
            <div><b>{fmtTok(data.tokenAll.thoughts)}</b><div className="text-xs text-stone-400">{t("其中思考")}</div></div>
            <div><b>{fmtTok(data.tokenAll.cached)}</b><div className="text-xs text-stone-400">{t("其中命中缓存")}</div></div>
            <div><b>{data.tokenAll.calls}</b><div className="text-xs text-stone-400">{t("调用次数")}</div></div>
          </div>
          {data.tokenSystem && data.tokenSystem.total > 0 && (
            <p className="mt-2 text-xs text-stone-400">{t("其中后台/系统任务(入库、判题、定时任务等,不归属具体用户):")} {fmtTok(data.tokenSystem.total)} · {data.tokenSystem.calls} {t("次")}</p>
          )}
          <p className="mt-1 text-[11px] text-stone-400">{t("缓存命中的输入是输入的一部分(不是额外量),计费时按折扣价;思考 token 不含在输出里但照样计费。")}</p>
        </div>
      )}
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
          {u.tokens && u.tokens.total > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50/60 p-2 ring-1 ring-amber-200/60">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold text-amber-800">🔥 {t("Token 消耗")}</span>
                <span className="text-xs text-stone-500">{t("近7天")} {fmtTok(u.tokens.total7)} · {u.tokens.calls} {t("次调用")}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-5 gap-1 text-center text-xs">
                <div><b>{fmtTok(u.tokens.prompt)}</b><div className="text-[10px] text-stone-400">{t("输入")}</div></div>
                <div><b>{fmtTok(u.tokens.cached)}</b><div className="text-[10px] text-stone-400">{t("其中缓存")}</div></div>
                <div><b>{fmtTok(u.tokens.thoughts)}</b><div className="text-[10px] text-stone-400">{t("思考")}</div></div>
                <div><b>{fmtTok(u.tokens.output)}</b><div className="text-[10px] text-stone-400">{t("输出")}</div></div>
                <div><b className="text-amber-800">{fmtTok(u.tokens.total)}</b><div className="text-[10px] text-stone-400">{t("总计")}</div></div>
              </div>
              {u.tokens.toolUse > 0 && <p className="mt-1 text-[10px] text-stone-400">{t("工具调用输入")} {fmtTok(u.tokens.toolUse)}</p>}
              {u.tokens.days30?.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] text-stone-500">{t("近30天每日消耗")}（{t("最高")} {fmtTok(Math.max(...u.tokens.days30.map((d) => d.total)))}）</div>
                  <div className="mt-1 flex items-end gap-[2px] h-10">
                    {(() => {
                      // 补齐没有消耗的日子,免得柱子挤在一起看不出节奏
                      const map = Object.fromEntries(u.tokens.days30.map((d) => [d.d, d]));
                      const out = [];
                      for (let i = 29; i >= 0; i--) {
                        const dt = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
                        out.push(map[dt] || { d: dt, total: 0, thoughts: 0, cached: 0, calls: 0 });
                      }
                      const mx = Math.max(1, ...out.map((d) => d.total));
                      return out.map((d) => (
                        <div key={d.d} className="flex-1 rounded-t bg-amber-500/80" style={{ height: `${Math.max(d.total ? 6 : 0, (d.total / mx) * 100)}%` }}
                          title={`${d.d}: ${fmtTok(d.total)} tokens (${t("思考")} ${fmtTok(d.thoughts)} · ${t("缓存")} ${fmtTok(d.cached)} · ${d.calls} ${t("次")})`} />
                      ));
                    })()}
                  </div>
                </div>
              )}
              {u.tokens.byModel?.length > 0 && (
                <p className="mt-1 text-[10px] text-stone-500">{u.tokens.byModel.map((m) => `${m.model || "?"}: ${fmtTok(m.total)}`).join(" · ")}</p>
              )}
            </div>
          )}
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
