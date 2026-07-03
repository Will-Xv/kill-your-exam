"use client";
import { useState } from "react";

export default function Login() {
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    const url = tab === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = tab === "login" ? { username, password } : { username, password, invite };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) { location.href = "/"; return; }
    const d = await res.json().catch(() => ({}));
    setErr(d.error || "出错了,再试一次"); setBusy(false);
  }
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <form onSubmit={submit} className="card w-full max-w-sm">
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">📘</div>
          <h1 className="text-xl font-bold">AI 备考助手</h1>
        </div>
        <div className="mb-4 flex rounded-xl bg-stone-100 p-1 text-sm">
          <button type="button" onClick={() => setTab("login")} className={`flex-1 rounded-lg py-2 ${tab === "login" ? "bg-white shadow font-medium" : "text-stone-500"}`}>登录</button>
          <button type="button" onClick={() => setTab("register")} className={`flex-1 rounded-lg py-2 ${tab === "register" ? "bg-white shadow font-medium" : "text-stone-500"}`}>注册</button>
        </div>
        <div className="space-y-3">
          <input className="input" placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <input className="input" type="password" placeholder={tab === "register" ? "设置密码(至少 6 位)" : "密码"} value={password} onChange={(e) => setPassword(e.target.value)} />
          {tab === "register" && <input className="input" placeholder="邀请码(问 Will 要)" value={invite} onChange={(e) => setInvite(e.target.value)} />}
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button className="btn w-full" disabled={busy || !username || !password}>{tab === "login" ? "登录" : "注册并进入"}</button>
        </div>
        <p className="text-xs text-stone-400 mt-4 text-center">登录一次,这台设备一年内免登录</p>
      </form>
    </div>
  );
}
