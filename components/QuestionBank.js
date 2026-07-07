"use client";
import { useEffect, useState } from "react";

const QT = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答" };

export default function QuestionBank({ t }) {
  const [list, setList] = useState(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [markMust, setMarkMust] = useState(false);
  const [msg, setMsg] = useState("");
  const [add, setAdd] = useState({ qtype: "single", stem: "", options: "", answer: "", must: false });

  async function load() {
    try { const r = await fetch("/api/mock/bank"); const d = await r.json(); setList(d.questions || []); setClosed(!!d.closedBank); } catch {}
  }
  useEffect(() => { load(); }, []);

  async function post(body) {
    setBusy(true);
    try { const r = await fetch("/api/mock/bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json(); if (d.questions) setList(d.questions); if (typeof d.closedBank === "boolean") setClosed(d.closedBank); setBusy(false); return d; } catch { setBusy(false); return {}; }
  }
  async function parse() {
    if (text.trim().length < 4) return;
    setMsg(t("整理中…"));
    const d = await post({ action: "parse", text, markMust });
    setMsg(t("已整理入库 {n} 道题").replace("{n}", d.added || 0)); setText("");
  }
  async function addOne() {
    if (!add.stem.trim()) return;
    await post({ action: "add", question: { qtype: add.qtype, stem: add.stem, options: add.options.split("\n").map((x) => x.trim()).filter(Boolean), answer: add.answer, must: add.must } });
    setAdd({ qtype: "single", stem: "", options: "", answer: "", must: false });
  }

  if (list === null) return null;
  return (
    <div className="card space-y-3">
      <h2 className="font-bold">📌 {t("我的题库(指定题库 / 必考原题)")}</h2>
      <p className="text-xs text-stone-500">{t("如果你已经知道这门考试会考哪些题(开卷、固定题库、每年必考的原题等),把它们放进来,模拟考会原样出、一字不差。")}</p>

      <label className="flex items-center gap-2 rounded-xl bg-amber-50 p-2 text-sm cursor-pointer">
        <input type="checkbox" checked={closed} disabled={busy} onChange={(e) => post({ action: "closed", on: e.target.checked })} />
        <span><b>{t("封闭题库")}</b> · {t("练习和模拟都只从这些题里出,不再生成新题")}</span>
      </label>

      <div className="space-y-2">
        <textarea className="input" rows={3} placeholder={t("粘贴已知会考的题目(可一次多道),AI 会一字不差地整理入库…")} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-stone-600"><input type="checkbox" checked={markMust} onChange={(e) => setMarkMust(e.target.checked)} />{t("整批标记为必考(每次必出)")}</label>
          <button className="btn py-1.5 text-sm" onClick={parse} disabled={busy || text.trim().length < 4}>{busy ? t("整理中…") : t("解析入库")}</button>
          {msg && <span className="text-xs text-emerald-700">{msg}</span>}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-stone-500">{t("或手动添加一道")}</summary>
        <div className="mt-2 space-y-2">
          <select className="input" value={add.qtype} onChange={(e) => setAdd({ ...add, qtype: e.target.value })}>
            {Object.keys(QT).map((k) => <option key={k} value={k}>{t(QT[k])}</option>)}
          </select>
          <textarea className="input" rows={2} placeholder={t("题干")} value={add.stem} onChange={(e) => setAdd({ ...add, stem: e.target.value })} />
          {(add.qtype === "single" || add.qtype === "multi") && <textarea className="input" rows={3} placeholder={t("选项(每行一个)")} value={add.options} onChange={(e) => setAdd({ ...add, options: e.target.value })} />}
          <input className="input" placeholder={t("答案(可留空)")} value={add.answer} onChange={(e) => setAdd({ ...add, answer: e.target.value })} />
          <label className="flex items-center gap-1 text-xs text-stone-600"><input type="checkbox" checked={add.must} onChange={(e) => setAdd({ ...add, must: e.target.checked })} />{t("必出")}</label>
          <button className="btn py-1.5 text-sm" onClick={addOne} disabled={busy || !add.stem.trim()}>{t("添加")}</button>
        </div>
      </details>

      <div className="space-y-1">
        <p className="text-xs text-stone-400">{t("共 {n} 道").replace("{n}", list.length)}{list.some((q) => q.must) ? ` · ${t("必出")} ${list.filter((q) => q.must).length}` : ""}</p>
        {list.length === 0 && <p className="text-sm text-stone-400">{t("还没有题库题。")}</p>}
        {list.map((q) => (
          <div key={q.id} className="flex items-start gap-2 border-b border-stone-100 py-1 text-sm">
            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">{t(QT[q.qtype] || q.qtype)}</span>
            <span className="min-w-0 flex-1 line-clamp-2">{q.stem}{q.must ? " ⭐" : ""}</span>
            <button className="shrink-0 text-xs text-amber-700" disabled={busy} onClick={() => post({ action: "must", id: q.id, on: !q.must })}>{q.must ? t("取消必出") : t("设为必出")}</button>
            <button className="shrink-0 text-xs text-red-500" disabled={busy} onClick={() => post({ action: "delete", id: q.id })}>{t("删除")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
