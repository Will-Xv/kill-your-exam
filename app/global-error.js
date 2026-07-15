"use client";
import { useEffect } from "react";

// 根布局级错误兜底(连 layout 都崩时用;必须自带 html/body)。
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    const msg = String((error && (error.message || error.name)) || error || "");
    if (/ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch|Importing a module script failed/i.test(msg)) {
      try {
        const KEY = "kye_chunk_reload_at";
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last > 20000) { sessionStorage.setItem(KEY, String(Date.now())); window.location.reload(); }
      } catch { try { window.location.reload(); } catch {} }
    }
  }, [error]);
  return (
    <html lang="zh">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "80px 24px", color: "#44403c" }}>
        <div style={{ fontSize: 40 }}>🛠️</div>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginTop: 12 }}>出了点小状况 · Something went wrong</h1>
        <p style={{ fontSize: 14, color: "#78716c", marginTop: 8 }}>刷新一下通常就好,你的数据没丢。 · A refresh usually fixes it — your data is safe.</p>
        <button onClick={() => window.location.reload()} style={{ marginTop: 20, background: "#f59e0b", color: "#fff", border: 0, borderRadius: 12, padding: "8px 16px", fontSize: 14, fontWeight: 600 }}>刷新 · Reload</button>
      </body>
    </html>
  );
}
