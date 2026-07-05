"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { DICTS, ZH_HANT } from "@/lib/translations";
import { toTrad } from "@/lib/s2t";

const Ctx = createContext({ lang: "zh", setLang: () => {}, t: (s) => s });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState("en");
  useEffect(() => {
    const local = typeof localStorage !== "undefined" && localStorage.getItem("beikao_lang");
    if (local) setLangState(local);
    (async () => {
      let userLang = null;
      try { const r = await fetch("/api/me"); if (r.ok) { const d = await r.json(); userLang = d?.user?.lang || null; } } catch {}
      if (userLang) { setLangState(userLang); localStorage.setItem("beikao_lang", userLang); return; }
      // 仅对"没设过语言"的新访客:按 IP 所在国家给默认语言(不在支持列表则英语);不持久化,用户自己选了才算数
      if (!local) { try { const g = await (await fetch("/api/geo")).json(); if (g?.lang) setLangState(g.lang); } catch {} }
    })();
  }, []);
  const setLang = useCallback((l) => {
    setLangState(l);
    localStorage.setItem("beikao_lang", l);
    fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: l }) }).catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = "Kill Your Exam";
  }, [lang]);
  const t = useCallback((s) => (lang === "zh" ? s : lang === "zh-Hant" ? (ZH_HANT[s] ?? toTrad(s)) : (DICTS[lang]?.[s] ?? s)), [lang]);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
