"use client";
import { usePathname } from "next/navigation";

const ACCENTS = {
  "/": "rgba(214,178,104,.22)",
  "/study": "rgba(201,154,78,.22)",
  "/practice": "rgba(224,186,112,.22)",
  "/mock": "rgba(230,168,70,.22)",
  "/knowledge": "rgba(190,146,74,.22)",
  "/mistakes": "rgba(210,150,80,.22)",
  "/materials": "rgba(245,196,120,.22)",
  "/chat": "rgba(222,182,112,.22)",
  "/exams": "rgba(184,142,82,.20)",
  "/settings": "rgba(184,142,82,.20)"
};

export default function Template({ children }) {
  const path = usePathname();
  // 登录/导引页有自己的全屏固定布局,不套过渡动画(避免 transform 破坏 fixed 定位)
  if (path === "/login" || path === "/welcome" || path === "/privacy" || path.startsWith("/onboarding")) return <>{children}</>;
  const key = Object.keys(ACCENTS).find((k) => (k === "/" ? path === "/" : path.startsWith(k))) || "/";
  return (
    <div key={path} className="page-enter">
      {children}
    </div>
  );
}
