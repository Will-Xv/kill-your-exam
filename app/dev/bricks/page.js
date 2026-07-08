"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

export default function BricksLab() {
  const t = useT();
  const [bricks, setBricks] = useState(null);
  const [denied, setDenied] = useState(false);
  const [sel, setSel] = useState(null);
  const [argsText, setArgsText] = useState("{}");
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/bricks");
    if (!r.ok) { setDenied(true); return; }
    const d = await r.json(); setBricks(d.bricks || []);
  }
  useEffect(() => { load(); }, []);

  function pick(b) {
    setSel(b); setOut(null);
    const tmpl = {}; (b.inputs || []).forEach((i) => { tmpl[i.key] = i.type === "number" ? 0 : i.type === "boolean" ? false : i.type === "json" ? null : ""; });
    setArgsText(JSON.stringify(tmpl, null, 2));
  }
  async function run() {
    setBusy(true); setOut(null);
    let args = {};
    try { args = JSON.parse(argsText || "{}"); } catch { setOut({ error: "参数不是合法 JSON" }); setBusy(false); return; }
    try {
      const r = await fetch("/api/bricks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run", name: sel.name, args }) });
      setOut(await r.json());
    } catch (e) { setOut({ error: String(e) }); }
    setBusy(false);
  }
  async function togglePublish(b) {
    setBusy(true);
    await fetch("/api/bricks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: b.published ? "unpublish" : "publish", name: b.name }) });
    await load(); setBusy(false);
  }

  if (denied) return <p className="mt-16 text-center text-slate-400">{t("这个页面只有开发者能看。")}</p>;
  if (!bricks) return <div className="shimmer h-40 rounded-3xl" />;

  const cats = [...new Set(bricks.map((b) => b.category))];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">🧱 {t("砖头实验室")}</h1>
        <p className="text-xs text-slate-400">{t("与现有功能隔离的可组合小工具。未发布的砖头只有开发者账号能调用测试;测好后点「发布」才对全站生效。")}</p>
      </div>

      {cats.map((cat) => (
        <div key={cat} className="card">
          <h2 className="font-bold mb-2">{cat}</h2>
          <div className="space-y-1">
            {bricks.filter((b) => b.category === cat).map((b) => (
              <div key={b.name} className="flex items-start gap-2 border-b border-slate-100 py-1.5 text-sm">
                <button className={`shrink-0 rounded px-2 py-0.5 text-xs ${sel?.name === b.name ? "bg-amber-500 text-white" : "bg-slate-100"}`} onClick={() => pick(b)}>{t("选")}</button>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs">{b.name} {b.write ? <span className="text-red-500">✎写</span> : <span className="text-slate-400">读</span>}</p>
                  <p className="text-xs text-slate-500">{b.title} — {b.description}</p>
                </div>
                <button className={`shrink-0 rounded px-2 py-0.5 text-xs ${b.published ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`} disabled={busy} onClick={() => togglePublish(b)}>{b.published ? t("已发布·点击撤下") : t("未发布·点击发布")}</button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {sel && (
        <div className="card space-y-2">
          <h2 className="font-bold">▶ {sel.name}</h2>
          {(sel.inputs || []).length > 0 && (
            <div className="text-xs text-slate-500">
              {t("参数")}: {sel.inputs.map((i) => `${i.key}${i.required ? "*" : ""}:${i.type}`).join(" · ")}
            </div>
          )}
          <textarea className="input font-mono text-xs" rows={6} value={argsText} onChange={(e) => setArgsText(e.target.value)} />
          <button className="btn" onClick={run} disabled={busy}>{busy ? t("运行中…") : t("运行")}</button>
          {out && <pre className="mt-2 max-h-96 overflow-auto rounded-xl bg-slate-900 p-3 text-xs text-emerald-200">{JSON.stringify(out, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}
