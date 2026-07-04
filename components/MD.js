"use client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// 把裸露的 LaTeX(如 \frac{x^2}{16}、x^2)自动用 $...$ 包裹,让 KaTeX 能渲染。
// 触发条件:出现 \命令,或 紧跟在字母/数字/}/) 后面的 ^ 或 _(即真正的上下标),
// 避免把填空下划线"______"误当公式。
function autoMath(s) {
  if (!s || s.includes("$")) return s; // 已带定界符则不处理
  s = s.replace(/\\\(/g, () => "$").replace(/\\\)/g, () => "$").replace(/\\\[/g, () => "$$").replace(/\\\]/g, () => "$$");
  if (s.includes("$")) return s;
  const mathChars = "A-Za-z0-9\\\\{}\\^_+\\-*/=().,|<>\\[\\]\\s";
  const re = new RegExp("[" + mathChars + "]*(?:\\\\[a-zA-Z]+|(?<=[A-Za-z0-9})])[\\^_])[" + mathChars + "]*", "g");
  return s.replace(re, (m) => {
    const lead = (m.match(/^\s*/) || [""])[0];
    const trail = (m.match(/\s*$/) || [""])[0];
    const core = m.trim();
    if (!core || !/[\\^_]/.test(core)) return m;
    return lead + "$" + core + "$" + trail;
  });
}

export default function MD({ children, className = "", inline = false }) {
  const s = autoMath(String(children ?? ""));
  const comps = inline ? { p: ({ children }) => <>{children}</> } : {};
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={comps}>{s}</ReactMarkdown>
    </div>
  );
}
