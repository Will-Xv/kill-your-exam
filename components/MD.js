"use client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// 把裸露的 LaTeX(如 \frac{x^2}{16}、x^2)在【非 $...$ 区段】里自动用 $...$ 包裹,让 KaTeX 能渲染。
function wrapBareRuns(s) {
  if (!s) return s;
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

// 代码被误当数学:AI 常把代码/函数名/字符串用 $...$(LaTeX)包起来,含引号的更会出现奇数 $ → 被当文字显示成字面 $。
// 【含引号的 $...$ 绝不可能是数学】→ 转成行内代码 `...`;并剥掉紧贴引号的 $(如 $"15.0" → "15.0")。对真数学零影响。
function codeNotMath(s) {
  if (!s || s.indexOf("$") < 0) return s;
  s = s.replace(/\$(?=["'\u201c\u2018])/g, "").replace(/(["'\u201d\u2019])\$/g, "$1"); // 剥掉贴着引号的 $
  s = s.replace(/\$([^$\n]{1,160})\$/g, (m, inner) => (/["'\u201c\u201d\u2018\u2019]/.test(inner) && !/\\[a-zA-Z]/.test(inner)) ? "`" + inner.replace(/\$/g, "") + "`" : m); // 含引号且无 LaTeX 命令 → 代码
  return s;
}

function autoMath(s) {
  if (!s) return s;
  s = s.replace(/\\\(/g, () => "$").replace(/\\\)/g, () => "$").replace(/\\\[/g, () => "$$").replace(/\\\]/g, () => "$$");
  // 逐段处理:已在 $...$ / $$...$$ 里的原样保留,只包裹外面漏写定界符的裸 LaTeX(解析常两者混排)
  const parts = s.split(/(\$\$[\s\S]*?\$\$|\$[^\n$]*?\$)/g);
  for (let i = 0; i < parts.length; i += 2) parts[i] = wrapBareRuns(parts[i]);
  return parts.join("");
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

// 结构化:AI 常把标题/块公式/列表和正文挤在一行,导致 Markdown 无法识别(标题变原文、块公式错乱)。
// 把这些块级元素拆到各自的行上,让 react-markdown 能正确解析。
function blockify(s) {
  if (!s) return s;
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (m) => "\n\n" + m + "\n\n"); // 块公式 $$...$$ 独占一段
  s = s.replace(/([^\n])(#{1,6}\s+)/g, "$1\n\n$2");                        // 行内的 ATX 标题 -> 换行到行首
  s = s.replace(/\s+---\s+/g, "\n\n---\n\n");                             // 行内分隔线 ---
  s = s.replace(/([^\n])\s+([*-])\s+(?=\*\*)/g, "$1\n\n$2 ");            // 形如 " * **要点**" 的列表项换行(避开乘号)
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

const KATEX_OPTS = { strict: false, throwOnError: false, errorColor: "#9a7b4f", maxExpand: 1000 };

export default function MD({ children, className = "", inline = false }) {
  let raw = String(children ?? "").replace(/\\r\\n|\\n(?![a-zA-Z])/g, "  \n"); // AI 偶尔输出字面量 \n,转成真正的换行
  let s = codeNotMath(raw);
  s = blockify(s);
  s = autoMath(s);
  s = unwrapProseMath(s);
  s = balanceDelims(s);
  const linkRenderer = ({ href, children }) => {
    const h = typeof href === "string" ? href : "";
    // 杀手生成、发给主人下载的文件 -> 渲染成醒目的下载按钮
    if (h.includes("/api/chat/file")) {
      return <a href={h} download className="my-1 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm transition hover:bg-amber-700">⬇️ {children}</a>;
    }
    const ext = h.startsWith("http");
    return <a href={h} className="font-medium text-amber-700 underline underline-offset-2 hover:text-amber-800" {...(ext ? { target: "_blank", rel: "noreferrer" } : {})}>{children}</a>;
  };
  const comps = inline ? { a: linkRenderer, p: ({ children }) => <>{children}</> } : { a: linkRenderer };
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper className={className}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, KATEX_OPTS]]} components={comps}>{s}</ReactMarkdown>
    </Wrapper>
  );
}
