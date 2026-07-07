"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

export default function Leaderboard() {
  const t = useT();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("weekly");
  const [busyId, setBusyId] = useState(0);

  const load = () => fetch("/api/leaderboard").then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d)).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!data) return null;
  const list = (tab === "weekly" ? data.weekly : data.total) || [];
  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`);

  async function taunt(uid) {
    setBusyId(uid);
    try { await fetch("/api/taunt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", toUserId: uid }) }); alert(t("嘲讽已送出!")); } catch {}
    setBusyId(0);
  }

  return (
    <div className="relative overflow-hidden rounded-3xl p-4 shadow-lg ring-1 ring-amber-900/10 text-white"
      style={{ backgroundColor: "#7a3b12", backgroundImage: "linear-gradient(135deg, rgba(90,40,10,.72), rgba(40,20,8,.82)), url('/taunts/leaderboard-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black tracking-tight">🏆 {t("排行榜")}</h2>
        <div className="flex gap-1 text-xs">
          <button onClick={() => setTab("weekly")} className={`rounded-full px-3 py-1 ${tab === "weekly" ? "bg-white/90 text-amber-800 font-bold" : "bg-white/15"}`}>{t("本周")}</button>
          <button onClick={() => setTab("total")} className={`rounded-full px-3 py-1 ${tab === "total" ? "bg-white/90 text-amber-800 font-bold" : "bg-white/15"}`}>{t("总榜")}</button>
        </div>
      </div>
      <p className="mt-1 text-xs text-amber-100/90">
        {data.champion && <span>👑 {t("上周冠军")}: <b>{data.champion.username}</b></span>}
        {data.totalChampion && <span>{data.champion ? " · " : ""}🏆 {t("总榜榜一")}: <b>{data.totalChampion.username}</b></span>}
        {data.canTaunt && <span> · {t("(就是你,可以嘲讽别人)")}</span>}
      </p>
      <div className="mt-2 space-y-1">
        {list.length === 0 && <p className="text-sm text-amber-100/80 py-2">{t("还没有做题记录")}</p>}
        {list.slice(0, 10).map((r, i) => (
          <div key={r.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm ${r.id === data.me.id ? "bg-white/25 font-bold" : "bg-white/10"}`}>
            <span className="w-6 text-center">{medal(i)}</span>
            <span className="flex-1 truncate">{r.username}{r.id === data.me.id ? " · " + t("你") : ""}</span>
            <span className="tabular-nums text-amber-100">{r.n} {t("题")}</span>
            {data.canTaunt && r.id !== data.me.id && (
              <button onClick={() => taunt(r.id)} disabled={busyId === r.id} className="rounded-full bg-red-500/90 px-2 py-0.5 text-[11px] font-semibold hover:bg-red-500">🗡️ {t("嘲讽")}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
