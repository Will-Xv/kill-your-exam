"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";
import MD from "@/components/MD";
import { WHATS_NEW, GUIDE_VERSION } from "@/lib/guide";

export default function Inbox() {
  const t = useT();
  const [items, setItems] = useState(null);
  const letterBody = (it) => it.lkey === `update-v${GUIDE_VERSION}`
    ? WHATS_NEW.map((w) => `**${w.icon} ${t(w.title)}**\n${t(w.body)}`).join("\n\n")
    : t(it.body);
  const [open, setOpen] = useState({});

  async function load() {
    try { const r = await fetch("/api/inbox", { credentials: "include" }); const d = await r.json(); setItems(d.items || []); } catch { setItems([]); }
  }
  useEffect(() => { load(); }, []);
  async function act(action, id) { await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) }).catch(() => {}); }
  function toggle(it) {
    setOpen((o) => ({ ...o, [it.id]: !o[it.id] }));
    if (!it.read_at) { act("read", it.id); setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, read_at: "now" } : x))); }
  }
  async function del(id) { setItems((xs) => xs.filter((x) => x.id !== id)); await act("delete", id); }
  const fmt = (ts) => (ts ? String(ts).slice(0, 10) : "");

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">📬 {t("收件箱")}</h1>
        {items && items.some((x) => !x.read_at) && (
          <button className="btn-ghost text-sm" onClick={async () => { await act("readAll"); setItems((xs) => xs.map((x) => ({ ...x, read_at: "now" }))); }}>{t("全部标为已读")}</button>
        )}
      </div>
      {items === null && <p className="mt-16 text-center text-stone-400 animate-pulse">{t("加载中…")}</p>}
      {items && items.length === 0 && <p className="mt-16 text-center text-stone-400">{t("暂时没有信件。")}</p>}
      <div className="mt-4 space-y-3">
        {items && items.map((it) => (
          <div key={it.id} className={`card ${it.read_at ? "" : "ring-1 ring-amber-400/60"}`}>
            <div className="flex items-start gap-2">
              <button className="flex-1 text-left" onClick={() => toggle(it)}>
                <div className="flex items-center gap-2">
                  {!it.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                  <span className="font-semibold">{t(it.title)}</span>
                </div>
                <div className="mt-0.5 text-xs text-stone-400">{fmt(it.created_at)}</div>
              </button>
              <button className="text-stone-400 hover:text-red-500" title={t("删除")} onClick={() => del(it.id)}>🗑</button>
            </div>
            {open[it.id] && (
              <div className="mt-3 border-t border-stone-100 pt-3 text-sm">
                <MD>{letterBody(it)}</MD>
                {it.att_kind === "devrec" && (
                  <div className="mt-3">
                    <p className="text-xs text-stone-500 mb-1">🎬 {t("开发者示范作答")}</p>
                    {(it.att_mime || "").startsWith("video") ? <video controls preload="metadata" className="w-full rounded-lg border border-stone-200 bg-black" src={`/api/inbox/attachment?letter=${it.id}`} /> : <audio controls preload="metadata" className="w-full" src={`/api/inbox/attachment?letter=${it.id}`} />}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
