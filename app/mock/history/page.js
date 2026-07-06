"use client";
import { useState, useEffect } from "react";
import { useT } from "@/components/I18n";
import MD from "@/components/MD";
import { useAiFetch } from "@/components/AiErrorDialog";
import Discuss from "@/components/Discuss";

const QTYPE = { single: "单选", multi: "多选", judge: "判断", fill: "填空", short: "简答" };
const letters = ["A", "B", "C", "D", "E", "F"];
function stripLabel(op, i) {
  const L = ["A", "B", "C", "D", "E", "F"][i] || "";
  return String(op == null ? "" : op).replace(new RegExp("^\\s*" + L + "[.．)、,]\\s*", "i"), "");
}

function ReviewItem({ it, idx, t }) {
  const isChoice = ["single", "multi", "judge"].includes(it.qtype);
  const options = it.qtype === "judge" ? ["对", "错"] : it.options || [];
  const imgAtts = (it.atts || []).map((a, i) => ({ ...a, i })).filter((a) => (a.mime || "").startsWith("image/") || a.name === "handwriting.png");
  const fileAtts = (it.atts || []).filter((a) => !((a.mime || "").startsWith("image/") || a.name === "handwriting.png"));
  return (
    <div className={`card ${it.correct ? "border-amber-400 bg-amber-50" : "border-red-300 bg-red-50"}`}>
      <p className="text-xs text-stone-400 mb-1">{idx + 1} · {t(QTYPE[it.qtype])} · <span className={it.correct ? "text-amber-700" : "text-red-600"}>{it.correct ? t("✓ 答对了") : t("✗ 不对")}</span></p>
      <MD className="font-medium prose-zh">{it.stem}</MD>
      {isChoice ? (
        <div className="mt-2 space-y-1.5">
          {options.map((op, i) => {
            const v = it.qtype === "judge" ? op : letters[i];
            const chosen = it.qtype === "multi" ? (it.ua || "").includes(v) : it.ua === v;
            return <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${chosen ? "border-amber-500 bg-amber-100" : "border-stone-200"}`}>{it.qtype !== "judge" && <b className="mr-1">{letters[i]}.</b>}{it.qtype === "judge" ? t(op) : <MD inline>{stripLabel(op, i)}</MD>}{chosen ? " ←" : ""}</div>;
          })}
        </div>
      ) : (
        <div className="mt-2 text-sm">
          <p className="text-slate-500">{t("你的作答:")}</p>
          {it.ua ? <div className="mt-1"><MD className="prose-zh">{it.ua}</MD></div> : (!imgAtts.length && !fileAtts.length && <p className="mt-1 text-slate-400">{t("(未答)")}</p>)}
          {imgAtts.map((a) => <img key={a.i} src={`/api/mock/att?attempt=${it.attemptId}&i=${a.i}`} alt="" className="mt-1 w-full rounded-xl border border-slate-200 bg-white" />)}
          {fileAtts.length > 0 && <p className="mt-1 text-xs text-slate-500">📎 {fileAtts.length} {t("个文件")}</p>}
        </div>
      )}
      <div className="mt-2 border-t border-stone-100 pt-2 text-sm">
        <p><b>{t("参考答案:")}</b>{it.qtype === "judge" ? t(it.answer) : <MD inline>{it.answer}</MD>}</p>
        {it.explanation && <div className="mt-1 text-slate-600"><b>{t("解析:")}</b><MD inline>{it.explanation}</MD></div>}
      </div>
      {it.attemptId && <Discuss questionId={it.qid} attemptId={it.attemptId} userAnswer={it.ua} />}
    </div>
  );
}

export default function MockHistory() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [mocks, setMocks] = useState(null);
  const [open, setOpen] = useState(null); // detail {id, score, items}
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => { try { const d = await aiFetch("/api/mock/history"); setMocks(d.mocks || []); } catch { setMocks([]); } })(); }, []); // eslint-disable-line

  async function view(id) {
    setBusy(true);
    try { const d = await aiFetch(`/api/mock/history?id=${id}`); setOpen(d); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {} } catch {}
    setBusy(false);
  }

  if (open) {
    return (
      <div className="space-y-3 md:mt-14 pb-4">
        <button className="btn-ghost text-sm" onClick={() => setOpen(null)}>← {t("返回列表")}</button>
        {open.score && (
          <div className="card text-center bg-gradient-to-br from-amber-600 to-amber-700 text-white border-0">
            <p className="text-5xl font-bold my-1">{open.score.pct}%</p>
            <p className="text-amber-100">{open.score.got} / {open.score.total}</p>
          </div>
        )}
        {(open.items || []).map((it, idx) => <ReviewItem key={it.attemptId || idx} it={it} idx={idx} t={t} />)}
      </div>
    );
  }

  return (
    <div className="space-y-3 md:mt-14 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("历史模拟考")}</h1>
        <a className="btn-ghost text-sm" href="/mock">{t("去模拟考")}</a>
      </div>
      {mocks === null && <p className="text-stone-400 text-sm">{t("加载中…")}</p>}
      {mocks && mocks.length === 0 && <p className="text-center text-stone-400 py-10">{t("还没有已交卷的模拟考。")}</p>}
      {mocks && mocks.map((m) => (
        <button key={m.id} onClick={() => view(m.id)} disabled={busy} className="card w-full text-left flex items-center justify-between hover:shadow-md transition">
          <span>
            <span className="text-lg font-bold text-amber-700">{m.pct}%</span>
            <span className="text-sm text-stone-500 ml-2">{m.got}/{m.total}</span>
          </span>
          <span className="text-xs text-stone-400">{new Date((m.created_at || "").replace(" ", "T") + "Z").toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}
