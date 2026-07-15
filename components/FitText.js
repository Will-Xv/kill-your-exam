"use client";
import { useLayoutEffect, useRef, useState } from "react";

// 文字自适应:在【固定高度的框】里,若内容放不下就把字号逐步调小到刚好放下(不截断、不撑大容器)。
// max/min 单位 px;lines 决定框高(按 max 字号 × 行数 × 行高)。用于功能卡片标题/说明,保证卡片尺寸统一。
export default function FitText({ children, className = "", max = 16, min = 10, lines = 2, weight, title }) {
  const ref = useRef(null);
  const [size, setSize] = useState(max);
  const lh = 1.2;
  const boxH = Math.ceil(max * lh * lines);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    let s = max, guard = 0;
    el.style.fontSize = s + "px";
    while (s > min && el.scrollHeight > el.clientHeight + 1 && guard < 40) { s -= 0.5; el.style.fontSize = s + "px"; guard++; }
    setSize(s);
  }, [children, max, min, lines]);
  return (
    <div ref={ref} className={className} title={title}
      style={{ fontSize: size, lineHeight: lh, fontWeight: weight, maxHeight: boxH, overflow: "hidden", wordBreak: "break-word", overflowWrap: "anywhere" }}>
      {children}
    </div>
  );
}
