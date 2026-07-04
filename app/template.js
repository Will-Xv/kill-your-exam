"use client";
import { usePathname } from "next/navigation";

const ACCENTS = {
  "/": "rgba(16,185,129,.16)",
  "/study": "rgba(56,189,248,.18)",
  "/practice": "rgba(16,185,129,.18)",
  "/mock": "rgba(251,146,60,.18)",
  "/knowledge": "rgba(139,92,246,.18)",
  "/mistakes": "rgba(244,63,94,.18)",
  "/materials": "rgba(245,158,11,.18)",
  "/chat": "rgba(34,211,238,.18)",
  "/exams": "rgba(100,116,139,.16)",
  "/settings": "rgba(100,116,139,.16)",
  "/collector": "rgba(236,72,153,.16)"
};

export default function Template({ children }) {
  const path = usePathname();
  // 登录/导引页有自己的全屏固定布局,不套过渡动画(避免 transform 破坏 fixed 定位)
  if (path === "/login" || path === "/welcome" || path === "/privacy" || path.startsWith("/onboarding")) return <>{children}</>;
  const key = Object.keys(ACCENTS).find((k) => (k === "/" ? path === "/" : path.startsWith(k))) || "/";
  return (
    <div key={path} className="page-enter">
      <div className="page-accent" style={{ background: `radial-gradient(600px 260px at 50% -60px, ${ACCENTS[key]}, transparent 70%)` }} />
      {children}
    </div>
  );
}
