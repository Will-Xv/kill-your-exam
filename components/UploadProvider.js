"use client";
// 【全局上传·跨页不中断】
// 从前上传逻辑写在 materials/page.js 里,一旦点去别的页(Next Link 客户端跳转),那个组件就卸载、
// 正在传的 XHR 被浏览器掐断 → 上传半途而废。把上传提到这个挂在 root layout 的 Provider 里,
// 它跨页面不卸载,XHR 就能一直传;每页右下角显示浮动进度条;快关标签页时提醒别关(否则字节流会断)。
import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { useT } from "@/components/I18n";

const UploadCtx = createContext(null);
export const useUploader = () => useContext(UploadCtx) || { startUpload: () => {}, jobs: [], active: false };

// 上传完某个文件后广播一下,让资料页(若正打开)自动刷新列表。
function announceChanged() { try { window.dispatchEvent(new Event("materials-changed")); } catch {} }

function xhrPost(url, body, onProg) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProg) onProg(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText || "{}")); } catch { resolve({}); } }
      else { let why = xhr.responseText || ("HTTP " + xhr.status); try { const j = JSON.parse(why); if (j && j.error) why = j.error; } catch {} reject(new Error(why)); }
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}

const CHUNK = 80 * 1024 * 1024;          // 每块 80MB
const CHUNK_THRESHOLD = 8 * 1024 * 1024; // 超过 8MB 才分块

export function UploadProvider({ children }) {
  const t = useT();
  const [jobs, setJobs] = useState([]); // {id,name,pct,status:'uploading'|'processing'|'done'|'failed',why}
  const runningRef = useRef(false);
  const queueRef = useRef([]);           // 待传 File 队列(带 job id)
  const active = jobs.some((j) => j.status === "uploading" || j.status === "queued");

  const patch = useCallback((id, upd) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...upd } : j)));
  }, []);

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length) {
        const { id, file: f } = queueRef.current.shift();
        patch(id, { status: "uploading", pct: 0 });
        try {
          if (f.size <= CHUNK_THRESHOLD) {
            const fd = new FormData(); fd.append("file", f);
            await xhrPost("/api/materials/upload", fd, (frac) => patch(id, { pct: Math.min(99, Math.round(frac * 100)) }));
          } else {
            const n = Math.ceil(f.size / CHUNK);
            const uploadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
            for (let i = 0; i < n; i++) {
              const blob = f.slice(i * CHUNK, Math.min(f.size, (i + 1) * CHUNK));
              const q = `?chunk=1&uploadId=${uploadId}&i=${i}&n=${n}&name=${encodeURIComponent(f.name)}&mime=${encodeURIComponent(f.type || "")}`;
              await xhrPost("/api/materials/upload" + q, blob, (frac) => patch(id, { pct: Math.min(99, Math.round(((i + frac) / n) * 100)) }));
            }
          }
          patch(id, { status: "processing", pct: 100 });
          announceChanged();
        } catch (e) {
          let why = String((e && e.message) || e);
          try { const j = JSON.parse(why); if (j && j.error) why = j.error; } catch {}
          patch(id, { status: "failed", why });
        }
      }
    } finally {
      runningRef.current = false;
      // 全部收尾后,把已进入"后台处理"的过几秒自动淡出(失败的留着让用户看原因)。
      setTimeout(() => setJobs((prev) => prev.filter((j) => j.status !== "processing")), 6000);
    }
  }, [patch]);

  const startUpload = useCallback((files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const added = list.map((f) => ({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), file: f, name: f.name, pct: 0, status: "queued", why: "" }));
    queueRef.current.push(...added);
    setJobs((prev) => [...prev.filter((j) => j.status !== "processing" && j.status !== "done"), ...added.map(({ file, ...rest }) => rest)]);
    drain();
  }, [drain]);

  const dismiss = useCallback((id) => setJobs((prev) => prev.filter((j) => j.id !== id)), []);

  // 【关标签/刷新前提醒】还在上传就弹浏览器原生确认(字节流靠这个页面活着,关了就断)。
  useEffect(() => {
    if (!active) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; return ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [active]);

  const shown = jobs.filter((j) => j.status !== "done");

  return (
    <UploadCtx.Provider value={{ startUpload, jobs, active }}>
      {children}
      {shown.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] w-[min(92vw,320px)] space-y-2">
          {shown.map((j) => (
            <div key={j.id} className="rounded-2xl bg-[#2f2413] px-3.5 py-2.5 text-[#f6efdd] shadow-xl ring-1 ring-black/20">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium">📎 {j.name}</span>
                {j.status === "failed" && <button className="shrink-0 text-[#f6efdd]/60 hover:text-white" onClick={() => dismiss(j.id)}>×</button>}
              </div>
              {(j.status === "uploading" || j.status === "queued") && (
                <>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${j.status === "queued" ? 0 : j.pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-[#ecdcb6]">{j.status === "queued" ? t("排队中…") : `${t("上传中")} ${j.pct}%`}</p>
                </>
              )}
              {j.status === "processing" && <p className="mt-1 text-[11px] text-[#ecdcb6]">✓ {t("已上传,正在后台处理")}</p>}
              {j.status === "failed" && <p className="mt-1 text-[11px] text-rose-300">✗ {t(j.why)}</p>}
            </div>
          ))}
        </div>
      )}
    </UploadCtx.Provider>
  );
}
