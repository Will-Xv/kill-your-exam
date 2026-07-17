"use client";
import { useRef } from "react";

// 可复用代码编辑器:左侧行号槽 + Tab/Shift+Tab 缩进(4空格)+ 换行【按语言】自动缩进。
// props: value, onChange(v), language, disabled, rows, placeholder, onSubmit?(Ctrl/⌘+Enter 触发)
const IND = "    ";
const leadingWS = (line) => (line.match(/^[ \t]*/) || [""])[0];
function extraIndent(prevLine, lang) {
  const s = prevLine.trim();
  const l = String(lang || "").toLowerCase();
  if (["python", "ruby"].includes(l)) { if (/:\s*$/.test(s)) return IND; return ""; }
  // C 系/大括号语言:行尾是 { ( [ 就多缩一层
  if (["javascript", "typescript", "js", "ts", "c", "cpp", "c++", "java", "go", "rust", "php", "csharp", "c#", "kotlin", "swift", "scala"].includes(l)) { if (/[{([]\s*$/.test(s)) return IND; return ""; }
  return "";   // bash / 其它:只保持当前缩进
}
export default function CodeEditor({ value = "", onChange, language = "python", disabled = false, rows = 10, placeholder = "", onSubmit }) {
  const gutterRef = useRef(null);
  const taRef = useRef(null);
  function onKeyDown(e) {
    const el = e.target, start = el.selectionStart, end = el.selectionEnd;
    if (onSubmit && (e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onSubmit(); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const head = value.slice(lineStart, start), m = head.match(/ {1,4}$/);
        if (m) { const n = m[0].length; onChange(value.slice(0, start - n) + value.slice(start)); requestAnimationFrame(() => { try { el.selectionStart = el.selectionEnd = start - n; } catch {} }); }
      } else {
        onChange(value.slice(0, start) + IND + value.slice(end));
        requestAnimationFrame(() => { try { el.selectionStart = el.selectionEnd = start + IND.length; } catch {} });
      }
      return;
    }
    if (e.key === "Backspace" && start === end) {
      // 像编辑器一样删缩进:光标前【本行只有空格】且有空格时,退格删到上一个缩进档(4空格),不是一格一格。
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const before = value.slice(lineStart, start);
      if (before.length > 0 && /^ +$/.test(before)) {
        e.preventDefault();
        const del = before.length % 4 === 0 ? 4 : before.length % 4;
        onChange(value.slice(0, start - del) + value.slice(start));
        requestAnimationFrame(() => { try { el.selectionStart = el.selectionEnd = start - del; } catch {} });
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !(e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const curLine = value.slice(lineStart, start);
      const insert = "\n" + leadingWS(curLine) + extraIndent(curLine, language);
      onChange(value.slice(0, start) + insert + value.slice(end));
      const pos = start + insert.length;
      requestAnimationFrame(() => { try { el.selectionStart = el.selectionEnd = pos; } catch {} });
      return;
    }
  }
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-stone-600 bg-stone-900">
      <div ref={gutterRef} className="pointer-events-none absolute inset-y-0 left-0 w-9 select-none overflow-hidden border-r border-stone-700 bg-stone-800 px-1 py-2 text-right font-mono text-sm leading-relaxed text-stone-500">
        {value.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <textarea ref={taRef} onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop; }}
        value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} disabled={disabled} rows={rows} spellCheck={false} placeholder={placeholder}
        className="w-full resize-y bg-transparent py-2 pl-11 pr-3 text-sm font-mono leading-relaxed text-stone-100 placeholder-stone-500 outline-none" style={{ tabSize: 4 }} />
    </div>
  );
}
