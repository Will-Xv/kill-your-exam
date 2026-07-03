"use client";
import { useState } from "react";

export default function Login() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    if (res.ok) location.href = "/";
    else { setErr("口令不对,再试一次"); setBusy(false); }
  }
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <form onSubmit={submit} className="card w-full max-w-sm text-center">
        <div className="text-4xl mb-3">📘</div>
        <h1 className="text-xl font-bold mb-1">AI 备考助手</h1>
        <p className="text-stone-500 mb-4 text-sm">请输入访问口令</p>
        <input className="input text-center text-lg tracking-widest mb-3" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoFocus />
        {err && <p className="text-red-600 text-sm mb-2">{err}</p>}
        <button className="btn w-full" disabled={busy || !code}>进入</button>
      </form>
    </div>
  );
}
