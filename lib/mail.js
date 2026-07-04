// 通过 Resend 发邮件。没配 RESEND_API_KEY 时返回 {sent:false},调用方仍会把内容存进数据库。
export async function sendEmail({ to, subject, text, attachments }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "no_key" };
  const from = process.env.FEEDBACK_FROM || "onboarding@resend.dev";
  const body = {
    from, to: [to], subject, text,
    attachments: (attachments || []).slice(0, 6).map((a) => ({ filename: a.name || "file", content: a.data })),
  };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { sent: false, reason: "http_" + r.status };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: String(e).slice(0, 120) };
  }
}
