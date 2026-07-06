"use client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// 把裸露的 LaTeX(如 \frac{x^2}{16}、x^2)自动用 $...$ 包裹,让 KaTeX 能渲染。
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

// 定界符纠错:$$ 或 $ 数量为奇数时(AI 常写坏),转义成普通字符,
// 否则一个没闭合的公式会把后面整段 Markdown(标题/列表)全吞进去、渲染成一大片红字。
function balanceDelims(s) {
  if (!s) return s;
  const blocks = (s.match(/\$\$/g) || []).length;
  const singles = (s.replace(/\$\$/g, "").match(/\$/g) || []).length;
  if (blocks % 2 !== 0) s = s.replace(/\$\$/g, "\\$\\$");         // 块公式未闭合 -> 直接当文字
  if (singles % 2 !== 0) s = s.replace(/(?<!\$)\$(?!\$)/g, "\\$"); // 行内公式未闭合 -> 当文字
  return s;
}

// 单块公式即便闭合,但里面混进了 Markdown 结构(标题/多段)也不是真公式,拆掉 $$ 让其正常渲染
function unwrapProseMath(s) {
  return s.replace(/\$\$([\s\S]*?)\$\$/g, (m, inner) => {
    if (/(^|\n)\s*#{1,6}\s|\n\s*\n|(^|\n)\s*[*-]\s/.test(inner)) return inner; // 含标题/空行/列表 => 不是公式
    return m;
  });
}

const KATEX_OPTS = { strict: false, throwOnError: false, errorColor: "#9a7b4f", maxExpand: 1000 };

export default function MD({ children, className = "", inline = false }) {
  let raw = String(children ?? "").replace(/\\r\\n|\\n(?![a-zA-Z])/g, "  \n"); // AI 偶尔输出字面量 \n,转成真正的换行
  let s = autoMath(raw);
  s = unwrapProseMath(s);
  s = balanceDelims(s);
  const comps = inline ? { p: ({ children }) => <>{children}</> } : {};
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, KATEX_OPTS]]} components={comps}>{s}</ReactMarkdown>
    </div>
  );
}
