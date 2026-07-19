"use client";
import { alertDialog } from "@/components/ui/dialog";
import { useState } from "react";
import { useT } from "@/components/I18n";
import { useAiFetch } from "@/components/AiErrorDialog";
import { filesToAttachments } from "@/lib/attach";

// 上传做题:只负责【上传+识别】,识别出题目后跳转到练习页(mode=quiz),
// 复用练习那一整套体验(独立无杀手、追问/争论、草稿纸、手写、刷新恢复)。
export default function UploadQuizPage() {
  const t = useT();
  const aiFetch = useAiFetch();
  const [busy, setBusy] = useState(false);

  async function onFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      const attachments = await filesToAttachments(files);
      const r = await aiFetch("/api/quiz-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachments }) });
      if (r && r.questions && r.questions.length) {
        const ids = r.questions.map((q) => q.id).join(",");
        window.location.href = `/practice?mode=quiz&ids=${ids}${r.sessionId ? "&quiz=" + r.sessionId : ""}`;   // 交给练习页,全套体验;quiz=会话id 供"重新识别"
        return;
      }
      alertDialog(t("没识别出题目,换个更清晰的文件再试。"));
    } catch (err) { /* aiFetch 已弹错误框 */ }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 md:mt-14">
      <h1 className="text-lg font-bold">📤 {t("上传做题")}</h1>
      <p className="text-sm text-stone-500">{t("传一份带题目的文件(图片/PDF/文档),系统会识别出里面的题目,你就地逐道作答,做完自动把掌握度记进对应知识点。")}</p>
      <label className={"card flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed py-10 text-center " + (busy ? "opacity-60" : "hover:border-amber-400")}>
        <input type="file" className="hidden" accept="image/*,.pdf,.docx,.txt,.md" multiple disabled={busy} onChange={onFiles} />
        <span className="text-3xl">{busy ? "⏳" : "📎"}</span>
        <span className="text-sm font-medium">{busy ? t("正在识别题目…") : t("点这里选文件(可多选)")}</span>
        {busy ? <span className="text-xs text-stone-400">{t("识别完会自动进入做题页")}</span> : null}
      </label>
    </div>
  );
}
