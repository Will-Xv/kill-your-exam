"use client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// 渲染 Markdown + LaTeX 公式。兼容 \( \) \[ \] 定界符,统一成 $ / $$。
export default function MD({ children, className = "", inline = false }) {
  let s = String(children ?? "");
  s = s.replace(/\\\(/g, () => "$").replace(/\\\)/g, () => "$").replace(/\\\[/g, () => "$$").replace(/\\\]/g, () => "$$");
  const comps = inline ? { p: ({ children }) => <>{children}</> } : {};
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={comps}>{s}</ReactMarkdown>
    </div>
  );
}
