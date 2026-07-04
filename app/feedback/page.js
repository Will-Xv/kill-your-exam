"use client";
import { useState } from "react";
import { useT } from "@/components/I18n";
import { useAiFetch } from "@/components/AiErrorDialog";
import { filesToAttachments } from "@/lib/attach";

export default function FeedbackPage() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [msg, setMsg] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // null | {emailed}

  async function send() {
    if ((!msg.trim() && !files.length) || busy) return;
    setBusy(true);
    try {
      const attachments = await filesToAttachments(files);
      const r = await aiFetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg.trim(), attachments }) });
      setDone({ emailed: r.emailed });
      setMsg(""); setFiles([]);
    } catch { setDone({ error: true }); }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold">✉️ {t("意见反馈")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("遇到问题、有想法,或者哪里不好用,都可以直接告诉开发者。可以附上截图。")}</p>

      {done ? (
        <div className="card mt-4 p-5 text-center">
          <p className="text-3xl">🙏</p>
          <p className="mt-2 font-medium">{t("已收到,谢谢你的反馈!")}</p>
          <p className="mt-1 text-sm text-slate-500">
            {done.error ? t("提交出了点问题,请稍后再试。") : done.emailed ? t("已经转发给开发者了。") : t("已记录下来,开发者会看到。")}
          </p>
          <button className="btn-ghost mt-4" onClick={() => setDone(null)}>{t("再写一条")}</button>
        </div>
      ) : (
        <div className="card mt-4 p-5">
          <textarea className="input" rows={6} placeholder={t("说说你的问题或建议…")} value={msg} onChange={(e) => setMsg(e.target.value)} />
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <label className="btn-ghost cursor-pointer px-3 py-1" title={t("上传截图/文件")}>📎 {t("添加截图/文件")}<input type="file" multiple hidden accept="image/*,.pdf,.txt" onChange={(e) => setFiles([...e.target.files])} /></label>
            {files.length > 0 && <span>{files.length} {t("个文件")} <button className="underline" onClick={() => setFiles([])}>{t("清除")}</button></span>}
          </div>
          <button className="btn mt-4 w-full" onClick={send} disabled={busy || (!msg.trim() && !files.length)}>{busy ? t("提交中…") : t("提交反馈")}</button>
        </div>
      )}
    </div>
  );
}
