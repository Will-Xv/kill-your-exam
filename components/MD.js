"use client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";   // 表格/删除线/任务列表:GFM 扩展,不装这个 react-markdown 根本不认表格
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
    // P3-2:文件名/标识符不是数学——别把 *MAT137_2526Syllabus-2.pdf* 这类下划线串当 LaTeX 包进 $...$
    if (!/\\[a-zA-Z]/.test(core)) {
      if (/\.[A-Za-z]{1,5}(\b|$)/.test(core)) return m;      // 带扩展名 → 文件名
      if (/_[A-Za-z0-9]*[A-Za-z]{2,}/.test(core)) return m;  // 下划线后接单词(snake_case/文件名),非真数学下标
    }
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

// 【保护代码不被数学处理】反引号/代码块里的内容(可能含合法的 $:shell $PATH、PHP $var、模板 ${x}、价格 $5 等)
// 在所有数学预处理【之前】先遮成占位符,处理完再原样放回——代码里的 $ 永远不被 KaTeX/定界符逻辑碰。
function protectCode(s) {
  const store = [];
  const stash = (m) => { store.push(m); return "\u0000C" + (store.length - 1) + "\u0000"; };
  s = s.replace(/```[\s\S]*?```/g, stash);   // 围栏代码块
  s = s.replace(/``[^`]*``/g, stash);          // 双反引号行内代码
  s = s.replace(/`[^`\n]*`/g, stash);         // 单反引号行内代码
  return { s, store };
}
function restoreCode(s, store) {
  return s.replace(/\u0000C(\d+)\u0000/g, (m, i) => (store[Number(i)] != null ? store[Number(i)] : m));
}

// 【保护表格不被下面的预处理搅烂】(2026-08,Will 反馈"表格显示不出来")
// 表格坏掉有两个原因,缺一不可地都要修:
//   ① 根子上没装 remark-gfm —— 表格不是 CommonMark 语法,不装就只能原样吐出满屏竖线(已在上面装好);
//   ② 就算装了,本文件的预处理还会把它拆散:
//      · blockify 里 /\s+---\s+/ 会把【带空格写的分隔行】"| --- | --- |" 当成水平分隔线,一行炸成好几段;
//      · wrapBareRuns 的字符类里含 "|",表格行只要出现 ^ 或 _ 或反斜杠命令,整行连竖线一起被包进 $...$。
// 所以这里先把整块表格遮起来,等所有预处理跑完再原样放回。
// 取舍:遮起来的部分不做"裸 LaTeX 自动补 $"(那个正则正是元凶);表格里已经写好的 $...$ 照常渲染,
//       \( \) 也会归一成 $,足够应付出题模型的写法。
function protectTables(s) {
  const store = [];
  s = s.replace(/(?:^|\n)((?:[ \t]*\|[^\n]*\|[ \t]*(?:\n|$)){2,})/g, (m, tbl) => {
    store.push(tbl.replace(/\\\(/g, "$").replace(/\\\)/g, "$"));
    return "\n\n\u0000T" + (store.length - 1) + "\u0000\n\n";
  });
  return { s, store };
}
function restoreTables(s, store) {
  return s.replace(/\u0000T(\d+)\u0000/g, (m, i) => (store[Number(i)] != null ? "\n" + store[Number(i)] : m));
}

const KATEX_OPTS = { strict: false, throwOnError: false, errorColor: "#9a7b4f", maxExpand: 1000 };

export default function MD({ children, className = "", inline = false }) {
  let raw = String(children ?? "").replace(/\\r\\n|\\n(?![a-zA-Z])/g, "  \n"); // AI 偶尔输出字面量 \n,转成真正的换行
  const { s: _masked, store: _codeStore } = protectCode(raw);
  const { s: _noTbl, store: _tblStore } = protectTables(_masked);
  let s = codeNotMath(_noTbl);
  s = blockify(s);
  s = autoMath(s);
  s = unwrapProseMath(s);
  s = balanceDelims(s);
  s = restoreTables(s, _tblStore);
  s = restoreCode(s, _codeStore);
  const linkRenderer = ({ href, children }) => {
    const h = typeof href === "string" ? href : "";
    // 杀手生成、发给主人下载的文件 -> 渲染成醒目的下载按钮
    if (h.includes("/api/chat/file")) {
      return <a href={h} download className="my-1 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm transition hover:bg-amber-700">⬇️ {children}</a>;
    }
    const ext = h.startsWith("http");
    return <a href={h} className="font-medium text-amber-700 underline underline-offset-2 hover:text-amber-800" {...(ext ? { target: "_blank", rel: "noreferrer" } : {})}>{children}</a>;
  };
  // 代码块/行内代码:长行【自动换行】,别横向溢出被裁掉(手机上尤其明显)
  const preRenderer = ({ children, ...props }) => <pre {...props} className="my-2 overflow-x-auto rounded-lg bg-stone-100/80 p-2.5 text-[13px] leading-snug" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>{children}</pre>;
  const codeRenderer = ({ children, className, ...props }) => <code {...props} className={className} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>{children}</code>;
  // 表格:默认没有任何边框,挤成一坨看不出行列;宽表在手机上要能横向滚动而不是撑破页面。
  const tableRenderer = ({ children }) => (
    <div className="my-2 -mx-1 overflow-x-auto"><table className="w-full min-w-[18rem] border-collapse text-[13px] leading-snug">{children}</table></div>
  );
  const thRenderer = ({ children, style }) => <th style={style} className="border border-stone-300/70 bg-stone-100/80 px-2 py-1 text-left font-semibold">{children}</th>;
  const tdRenderer = ({ children, style }) => <td style={style} className="border border-stone-200 px-2 py-1 align-top">{children}</td>;
  const tableComps = { table: tableRenderer, th: thRenderer, td: tdRenderer };
  // 【有表格就不能用 inline】追问回复、题目解析这些【最容易出表格】的地方,调用方写的都是 <MD inline>,
  // 而 inline 会把整段塞进 <span> —— <table> 嵌在 <span> 里是非法 HTML,浏览器会把它拽出去、样式全丢。
  // 所以这里自动判断:这段文字里只要有表格(protectTables 遮到了东西),就【降级成块级渲染】,
  // 调用方一个字都不用改。没有表格时 inline 行为完全不变(不换行、不生成 <p>)。
  const useInline = inline && _tblStore.length === 0;
  const comps = useInline ? { a: linkRenderer, code: codeRenderer, p: ({ children }) => <>{children}</> } : { a: linkRenderer, pre: preRenderer, code: codeRenderer, ...tableComps };
  const Wrapper = useInline ? "span" : "div";
  return (
    <Wrapper className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, KATEX_OPTS]]} components={comps}>{s}</ReactMarkdown>
    </Wrapper>
  );
}
