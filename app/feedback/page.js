"use client";
import { useT } from "@/components/I18n";
import { useState } from "react";

const OWNER_EMAIL = "xuy413682@gmail.com";

export default function FeedbackPage() {
  const t = useT();
  const [msg, setMsg] = useState("");

  function openMail() {
    const subject = encodeURIComponent("[备考网站] 意见反馈");
    const body = encodeURIComponent(msg.trim() || "");
    // 打开用户默认邮件客户端的写信界面(和旧站"联系开发者"一致)
    window.location.href = `mailto:${OWNER_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold">✉️ {t("意见反馈")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("遇到问题或有想法,写下来后点下面的按钮,会打开你的邮件应用把内容发给开发者。截图/文件可以在邮件应用里直接添加。")}</p>

      <div className="card mt-4 p-5">
        <textarea className="input" rows={7} placeholder={t("说说你的问题或建议…")} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <button className="btn mt-4 w-full" onClick={openMail}>{t("用邮件发送给开发者")}</button>
        <p className="mt-2 text-center text-xs text-slate-400">{t("会发送到")} {OWNER_EMAIL}</p>
      </div>
    </div>
  );
}
