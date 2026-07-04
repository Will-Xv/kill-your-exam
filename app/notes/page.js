"use client";
import { useT } from "@/components/I18n";
import { useEffect, useState } from "react";
import MD from "@/components/MD";

export default function NotesPage() {
  const t = useT();
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState(null);
  const [editBody, setEditBody] = useState("");

  const load = () => fetch("/api/notes").then((r) => r.json()).then((d) => setItems(d.items));
  useEffect(() => { load(); }, []);

  async function addFree() {
    if (!draft.trim()) return;
    await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft.trim() }) });
    setDraft(""); load();
  }
  async function saveEdit(id) {
    await fetch("/api/notes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, body: editBody }) });
    setEditId(null); load();
  }
  async function del(id) {
    if (!confirm(t("删除这条笔记?"))) return;
    await fetch("/api/notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  if (!items) return <p className="mt-16 text-center text-stone-400">{t("加载中…")}</p>;

  return (
    <div className="space-y-3 md:mt-14">
      <h1 className="text-2xl font-bold">📓 {t("笔记本")}</h1>
      <p className="text-xs text-stone-400">{t("你手动收藏的题和随手记的笔记都在这里。错题本里的题不会自动进来。AI 也能读到这些笔记。")}</p>

      <div className="card">
        <textarea className="input" rows={3} placeholder={t("随手记点什么…(支持 Markdown 和数学公式)")} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn mt-2 text-sm py-2" onClick={addFree} disabled={!draft.trim()}>{t("添加笔记")}</button>
      </div>

      {items.length === 0 && <p className="text-center text-stone-400 py-6">{t("还没有笔记。做题时点「记笔记」,或在上面直接记。")}</p>}

      {items.map((n) => (
        <div key={n.id} className="card space-y-2">
          {n.question && (
            <div className="rounded-xl bg-stone-50 p-3 text-sm">
              <span className="badge-material">{t("收藏的题")}</span>
              <div className="mt-1"><MD>{n.question.body?.stem || ""}</MD></div>
              {n.question.answer?.answer && <p className="mt-1 text-xs text-stone-500"><b>{t("答案:")}</b><MD inline>{String(n.question.answer.answer)}</MD></p>}
            </div>
          )}
          {editId === n.id ? (
            <div>
              <textarea className="input" rows={4} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
              <div className="mt-2 flex gap-2">
                <button className="btn text-sm py-1.5" onClick={() => saveEdit(n.id)}>{t("保存")}</button>
                <button className="btn-ghost text-sm py-1.5" onClick={() => setEditId(null)}>{t("取消")}</button>
              </div>
            </div>
          ) : (
            <div>
              {n.body ? <MD>{n.body}</MD> : <p className="text-sm text-stone-400">{t("(空笔记,点编辑写点什么)")}</p>}
              <div className="mt-2 flex gap-3 text-xs text-stone-400">
                <button className="underline" onClick={() => { setEditId(n.id); setEditBody(n.body || ""); }}>{t("编辑")}</button>
                <button className="underline text-red-500" onClick={() => del(n.id)}>{t("删除")}</button>
                <span className="ml-auto">{(n.updatedAt || n.createdAt)?.slice(0, 16).replace("T", " ")}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
