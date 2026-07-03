"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { DICTS } from "@/lib/translations";

const Ctx = createContext({ lang: "zh", setLang: () => {}, t: (s) => s });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState("en");
  useEffect(() => {
    const local = typeof localStorage !== "undefined" && localStorage.getItem("beikao_lang");
    if (local) setLangState(local);
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.user?.lang) { setLangState(d.user.lang); localStorage.setItem("beikao_lang", d.user.lang); }
    }).catch(() => {});
  }, []);
  const setLang = useCallback((l) => {
    setLangState(l);
    localStorage.setItem("beikao_lang", l);
    fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: l }) }).catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    const titles = { zh: "AI 备考助手", en: "ExamPrep AI", fr: "ExamPrep IA", es: "ExamPrep IA", ru: "ExamPrep AI", ar: "مساعد الامتحان", id: "ExamPrep AI" };
    document.title = titles[lang] || "ExamPrep AI";
  }, [lang]);
  const t = useCallback((s) => (lang === "zh" ? s : DICTS[lang]?.[s] ?? s), [lang]);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
