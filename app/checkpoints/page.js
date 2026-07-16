"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

const OP_LABEL = {
  rebuild_tree: "重建知识树", set_parent: "挂为小任务", unset_parent: "解除小任务",
  set_aggregate: "开关汇总复习", copy_kps: "复制知识点", copy_questions: "复制题目",
  promote_weak: "提拔薄弱/错题", provision_attach: "新建母考试并挂子",
};

export default function Checkpoints() {
  const t = useT();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/checkpoints").then((r) => r.json()).then((d) => setList(d.checkpoints || [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  async function rollback(id, label) {
    if (!confirm(t("确定回档撤销这次「{x}」?这会把相关考试还原到该操作【执行前】的状态,当前之后的改动会被覆盖。").replace("{x}", label))) return;
    setBusy(id); setMsg("");
    try {
      const d = await fetch("/api/checkpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rollback", checkpointId: id }) }).then((r) => r.json());
      if (d.ok) { setMsg(t("已回档 ✓ 相关考试已还原。")); await load(); }
      else setMsg((d.error || t("回档失败")) + "");
    } catch { setMsg(t("回档失败")); }
    setBusy(0);
  }
  async function redo(id) {
    setBusy(id); setMsg("");
    try {
      const d = await fetch("/api/checkpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "redo", checkpointId: id }) }).then((r) => r.json());
      if (d.ok) { setMsg(t("已重做 ✓ 相关考试已恢复到撤销前。")); await load(); }
      else setMsg((d.error || t("重做失败")) + "");
    } catch { setMsg(t("重做失败")); }
    setBusy(0);
  }
  async function clearAll() {
    if (!confirm(t("清空全部回档存档点?清空后就不能再撤销之前的操作了。"))) return;
    setBusy(-1);
    try { await fetch("/api/checkpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear" }) }); await load(); } catch {}
    setBusy(0);
  }

  const fmt = (ts) => { try { return new Date(ts.replace(" ", "T") + "Z").toLocaleString(); } catch { return ts; } };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6 md:pt-20">
      <h1 className="text-2xl font-black">↩️ {t("回档(后悔药)")}</h1>
      <p className="mt-2 text-sm text-[#8a7a54]">{t("对知识树/考试结构的每一次大改(重建、合并、复制、挂父、开汇总等)都自动留了一个还原点。想撤就点「撤销」,把相关考试还原到那次改动之前。默认保留最近 40 次、最多 60 天,更早的自动清掉。")}</p>

      {msg && <div className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-800">{msg}</div>}

      {list === null ? <p className="mt-10 text-center text-slate-400">{t("加载中…")}</p>
        : !list.length ? <p className="mt-10 text-center text-slate-400">{t("还没有可回档的操作。等你(或杀手)做了知识树/结构类大改,这里就会出现存档点。")}</p>
        : (
          <>
            <div className="mt-4 space-y-2">
              {list.map((c) => (
                <div key={c.id} className={`card flex items-center justify-between gap-3 py-3 ${c.undone ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#2f2413]">{t(OP_LABEL[c.op] || c.op)}{c.names && c.names.length ? " · " + c.names.join(", ") : ""}</p>
                    <p className="mt-0.5 text-xs text-[#8a7a54]">{fmt(c.created_at)}{c.undone ? " · " + t("已撤销") : ""}</p>
                  </div>
                  {c.undone
                    ? (c.redoable
                        ? <button className="btn-ghost shrink-0 text-sm" disabled={busy === c.id} onClick={() => redo(c.id)}>{busy === c.id ? t("重做中…") : "↪️ " + t("重做")}</button>
                        : <span className="shrink-0 text-xs text-slate-400">{t("已撤销")}</span>)
                    : <button className="btn-ghost shrink-0 text-sm" disabled={busy === c.id} onClick={() => rollback(c.id, t(OP_LABEL[c.op] || c.op) + (c.names && c.names.length ? " · " + c.names.join(", ") : ""))}>{busy === c.id ? t("回档中…") : "↩️ " + t("撤销")}</button>}
                </div>
              ))}
            </div>
            <button className="mt-6 text-sm text-rose-500 hover:underline" disabled={busy === -1} onClick={clearAll}>{busy === -1 ? t("清理中…") : t("清空全部存档点")}</button>
          </>
        )}
    </div>
  );
}
