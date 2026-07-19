"use client";
// 统一的应用内弹窗(替换浏览器原生 confirm/alert/prompt):纯 DOM 挂到 document.body、样式对齐应用,
// 返回 Promise。confirmDialog→boolean、alertDialog→void、promptDialog→string|null。按钮文案按当前界面语言本地化。
import { DICTS, ZH_TW, ZH_HK } from "@/lib/translations";
import { toTradTW, toTradHK } from "@/lib/s2t";

function _lang() { try { return (typeof localStorage !== "undefined" && localStorage.getItem("beikao_lang")) || "en"; } catch { return "en"; } }
function _t(s) { const lang = _lang(); return lang === "zh" ? s : lang === "zh-TW" ? (ZH_TW[s] ?? toTradTW(s)) : lang === "zh-HK" ? (ZH_HK[s] ?? toTradHK(s)) : (DICTS[lang]?.[s] ?? s); }

function _modal({ message, ok, cancel, danger, input, defaultValue }) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") { resolve(input ? null : false); return; }
    const overlay = document.createElement("div");
    overlay.setAttribute("data-kye-dialog", "1");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:16px;";
    const card = document.createElement("div");
    card.style.cssText = "width:100%;max-width:26rem;background:#fbf6e9;border-radius:1rem;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.35);font-family:inherit;";
    const msg = document.createElement("p");
    msg.style.cssText = "margin:0 0 14px;font-size:14px;line-height:1.55;color:#3d2b10;white-space:pre-line;";
    msg.textContent = message == null ? "" : String(message);
    card.appendChild(msg);
    let field = null;
    if (input) {
      field = document.createElement("input");
      field.type = "text"; field.value = defaultValue || "";
      field.style.cssText = "width:100%;box-sizing:border-box;margin:0 0 14px;padding:8px 10px;border:1px solid #dbc999;border-radius:8px;font-size:14px;background:#fff;color:#2f2413;";
      card.appendChild(field);
    }
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";
    const cleanup = () => { try { document.body.removeChild(overlay); } catch {} window.removeEventListener("keydown", onKey); };
    const done = (v) => { cleanup(); resolve(v); };
    if (cancel !== null) {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button"; cancelBtn.textContent = cancel || _t("取消");
      cancelBtn.style.cssText = "padding:8px 14px;border-radius:10px;border:1px solid #dbc999;background:#fff;color:#3d2b10;font-size:14px;font-weight:600;cursor:pointer;";
      cancelBtn.onclick = () => done(input ? null : false);
      row.appendChild(cancelBtn);
    }
    const okBtn = document.createElement("button");
    okBtn.type = "button"; okBtn.textContent = ok || _t("确定");
    okBtn.style.cssText = "padding:8px 14px;border-radius:10px;border:none;background:" + (danger ? "#9e140c" : "#2f2413") + ";color:#f6efdd;font-size:14px;font-weight:700;cursor:pointer;";
    okBtn.onclick = () => done(input ? field.value : true);
    row.appendChild(okBtn);
    card.appendChild(row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) done(input ? null : false); });
    const onKey = (e) => {
      if (e.key === "Escape") done(input ? null : false);
      else if (e.key === "Enter" && !input) done(true);
      else if (e.key === "Enter" && input) done(field.value);
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => { try { (input ? field : okBtn).focus(); } catch {} }, 0);
  });
}

export function confirmDialog(message, opts = {}) { return _modal({ message, ok: opts.ok, cancel: opts.cancel, danger: opts.danger }); }
export function alertDialog(message, opts = {}) { return _modal({ message, ok: opts.ok, cancel: null, danger: opts.danger }); }
export function promptDialog(message, opts = {}) { return _modal({ message, ok: opts.ok, cancel: opts.cancel, input: true, defaultValue: opts.defaultValue }); }
