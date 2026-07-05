"use client";
import { useEffect, useRef, useState } from "react";
import { useT, useI18n } from "@/components/I18n";
import { useAiFetch } from "@/components/AiErrorDialog";
import MD from "@/components/MD";

const CUE = { zh: ["开始", "zh-CN"], en: ["Start", "en-US"], fr: ["Commencez", "fr-FR"], es: ["Empieza", "es-ES"], ru: ["Начали", "ru-RU"], ar: ["ابدأ", "ar-SA"], id: ["Mulai", "id-ID"] };
function pickMime(video) {
  const cands = video
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of cands) { try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c; } catch {} }
  return "";
}

export default function PerformTask({ q, onNext }) {
  const t = useT();
  const { lang } = useI18n();
  const aiFetch = useAiFetch();
  const body = q.body || {};
  const isVideo = body.captureType === "video";
  const mediaSrc = body.mediaMaterialId ? `/api/materials/raw?id=${body.mediaMaterialId}` : null;
  const analyzeAudio = body.analyzeAudio || (isVideo && body.mediaMaterialId ? "music" : "recorded");

  const [phase, setPhase] = useState("idle"); // idle | countdown | recording | recorded | grading | graded
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [autoLeft, setAutoLeft] = useState(0);
  const [err, setErr] = useState("");
  const [blobUrl, setBlobUrl] = useState(null);
  const [result, setResult] = useState(null);

  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const liveVideoRef = useRef(null);
  const mediaRef = useRef(null);       // the audio being played during recording
  const previewAudioRef = useRef(null); //試听
  const timersRef = useRef([]);

  function clearTimers() { timersRef.current.forEach((id) => clearInterval(id) || clearTimeout(id)); timersRef.current = []; }
  function stopStream() { try { streamRef.current?.getTracks().forEach((tk) => tk.stop()); } catch {} streamRef.current = null; }
  // 直播预览:视频元素只在 countdown/recording 阶段才挂载,所以在这里(挂载后)再把摄像头流接上,否则用户看不到自己
  useEffect(() => {
    if (!isVideo) return;
    if (phase !== "countdown" && phase !== "recording") return;
    const v = liveVideoRef.current, stream = streamRef.current;
    if (!v || !stream) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    v.muted = true; v.playsInline = true;
    v.play().catch(() => {});
  }, [phase, isVideo]);
  useEffect(() => () => { clearTimers(); stopStream(); try { mediaRef.current?.pause(); } catch {}; if (blobUrl) URL.revokeObjectURL(blobUrl); }, []); // cleanup

  function speakStart() {
    try {
      const [word, code] = CUE[lang] || CUE.en;
      const u = new SpeechSynthesisUtterance(word); u.lang = code; u.rate = 1;
      window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(u);
    } catch {}
  }

  async function begin() {
    setErr("");
    // 在用户点击这个手势里先"解锁"配乐音频:静音播一下再暂停,规避浏览器对定时器里自动播放的限制
    if (mediaSrc) {
      try {
        const a = mediaRef.current || new Audio(mediaSrc); mediaRef.current = a;
        a.muted = true; await a.play(); a.pause(); a.currentTime = 0; a.muted = false;
      } catch {}
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(isVideo ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } } : { audio: true });
    } catch (e) {
      setErr(t("无法访问摄像头/麦克风,请在浏览器允许权限后重试。")); return;
    }
    streamRef.current = stream;
    if (isVideo && liveVideoRef.current) { liveVideoRef.current.srcObject = stream; liveVideoRef.current.muted = true; try { await liveVideoRef.current.play(); } catch {} }
    // 321 倒计时
    setPhase("countdown"); setCount(body.countdownSec || 3);
    let c = body.countdownSec || 3;
    const iv = setInterval(() => {
      c -= 1; setCount(c);
      if (c <= 0) { clearInterval(iv); speakStart(); startRecording(); }
    }, 1000);
    timersRef.current.push(iv);
  }

  function startRecording() {
    const stream = streamRef.current; if (!stream) return;
    chunksRef.current = [];
    let rec;
    try { const mt = pickMime(isVideo); rec = new MediaRecorder(stream, { ...(mt ? { mimeType: mt } : {}), videoBitsPerSecond: 1800000, audioBitsPerSecond: 96000 }); }
    catch { try { rec = new MediaRecorder(stream); } catch { setErr(t("此浏览器不支持录制,建议用最新版 Chrome。")); return; } }
    recRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || (isVideo ? "video/webm" : "audio/webm") });
      blobRef.current = blob;
      const url = URL.createObjectURL(blob); setBlobUrl(url);
      stopStream(); try { mediaRef.current?.pause(); } catch {}
      setPhase("recorded");
    };
    rec.start();
    setPhase("recording"); setElapsed(0);
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    timersRef.current.push(tick);
    // 安全上限
    const cap = setTimeout(() => stopRecording(), (body.maxDurationSec || 300) * 1000);
    timersRef.current.push(cap);
    // 播放媒体(若有)
    if (mediaSrc) {
      const a = mediaRef.current || new Audio(mediaSrc); mediaRef.current = a;
      a.onended = () => {
        // 媒体结束 → autoStopAfterMediaSec 倒计时后自动停
        let left = body.autoStopAfterMediaSec || 7; setAutoLeft(left);
        const iv = setInterval(() => { left -= 1; setAutoLeft(left); if (left <= 0) { clearInterval(iv); stopRecording(); } }, 1000);
        timersRef.current.push(iv);
      };
      try { a.currentTime = 0; } catch {}
      a.play().catch(() => {});
    }
  }

  function stopRecording() {
    clearTimers();
    try { if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop(); else { stopStream(); setPhase("recorded"); } } catch { setPhase("recorded"); }
    try { mediaRef.current?.pause(); } catch {}
  }

  function reset() {
    clearTimers(); stopStream();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null); blobRef.current = null; setResult(null); setErr(""); setElapsed(0); setAutoLeft(0);
    setPhase("idle");
  }

  async function submit() {
    if (!blobRef.current) return;
    if (blobRef.current.size > 300 * 1024 * 1024) { setErr(t("录制文件太大(超过 300MB),请缩短时长后重录。")); return; }
    setPhase("grading"); setErr("");
    try {
      const fd = new FormData();
      fd.append("questionId", String(q.id));
      fd.append("recording", blobRef.current, isVideo ? "perform.webm" : "perform.webm");
      const d = await aiFetch("/api/perform/grade", { method: "POST", body: fd });
      setResult(d); setPhase("graded");
    } catch (e) { setErr(t("点评失败,请重试。")); setPhase("recorded"); }
  }

  function togglePreview() {
    if (!mediaSrc) return;
    const a = previewAudioRef.current || new Audio(mediaSrc); previewAudioRef.current = a;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }

  return (
    <div className="card space-y-3">
      <MD className="font-medium prose-zh">{body.stem}</MD>
      {body.instructions && <p className="text-sm text-slate-600">{body.instructions}</p>}
      {body.rubric?.length > 0 && <p className="text-xs text-slate-500">🎯 {t("评分维度:")}{body.rubric.join(" · ")}</p>}
      <p className="text-[11px] text-amber-700">⚠️ {t("AI 辅助点评,仅供练习参考,不代表专业评委的权威评分。")}</p>
      <p className="text-[11px] text-slate-500">🔎 {isVideo
        ? t("我们会把你的整段录像交给 AI,按每秒 5 帧分析画面(整段都看,没有张数上限);") + (analyzeAudio === "music"
            ? t("舞蹈/形体类:只用所给音乐原曲判断你是否踩上节拍,录像里录到的原声不单独分析。")
            : analyzeAudio === "both"
            ? t("并用所给音乐原曲对齐节拍、同时分析你录进去的声音。")
            : t("并分析你录像里录到的声音(如台词/演唱)。"))
        : t("我们会分析你的录音。")}</p>

      {mediaSrc && phase === "idle" && (
        <button className="btn-ghost text-sm py-1.5" onClick={togglePreview}>🎵 {t("试听所给音乐(录制时会自动播放)")}</button>
      )}

      {isVideo && (phase === "countdown" || phase === "recording") && (
        <video ref={liveVideoRef} autoPlay playsInline muted className="w-full max-h-72 rounded-xl bg-black" />
      )}

      {phase === "countdown" && <div className="text-center text-5xl font-black text-amber-600">{count > 0 ? count : "•"}</div>}

      {phase === "recording" && (
        <div className="flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-sm">
          <span className="font-semibold text-red-600">● {t("录制中")} {elapsed}s{autoLeft > 0 ? ` · ${t("将自动结束")} ${autoLeft}s` : ""}</span>
          <button className="btn px-4 py-1.5" onClick={stopRecording}>■ {t("停止")}</button>
        </div>
      )}

      {(phase === "recorded" || phase === "graded") && blobUrl && (
        isVideo ? <video src={blobUrl} controls playsInline className="w-full max-h-72 rounded-xl bg-black" />
                : <audio src={blobUrl} controls className="w-full" />
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}

      {phase === "idle" && <button className="btn w-full" onClick={begin}>{isVideo ? "🎥" : "🎙️"} {t("开始录制")}</button>}
      {phase === "recorded" && (
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={reset}>↺ {t("重录")}</button>
          <button className="btn flex-1" onClick={submit}>{t("提交点评")}</button>
        </div>
      )}
      {phase === "grading" && <p className="text-center text-sm text-amber-700 animate-pulse">{t("AI 点评中…(视频较大时会久一点)")}</p>}

      {phase === "graded" && result && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="font-bold">{result.score} {t("分")}</p>
          <div className="text-sm mt-1"><MD>{result.feedback}</MD></div>
        </div>
      )}

      {phase === "graded" && (
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={reset}>↺ {t("再练一次")}</button>
          <button className="btn flex-1" onClick={onNext}>{t("下一题 →")}</button>
        </div>
      )}
    </div>
  );
}
