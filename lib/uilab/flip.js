"use client";
// FLIP 位移动画:排列变化时,让带 data-flip 的元素从"旧位置"滑到"新位置"。
// 布局编辑器现在用它;将来放置表的移动(导航栏/更多/分区之间)也复用它,让用户看清东西从哪挪到哪。
import { useRef, useLayoutEffect } from "react";

export function useFlip(rootRef, signature, opts = {}) {
  const dur = opts.duration || 260;
  const ease = opts.ease || "cubic-bezier(.2,.85,.25,1)";
  const rects = useRef({});
  useLayoutEffect(() => {
    const root = rootRef.current; if (!root) return;
    const els = root.querySelectorAll("[data-flip]");
    els.forEach((el) => {
      const id = el.getAttribute("data-flip"); if (!id) return;
      const cur = el.getBoundingClientRect();
      const prev = rects.current[id];
      if (prev && (Math.abs(prev.left - cur.left) > 0.5 || Math.abs(prev.top - cur.top) > 0.5)) {
        const dx = prev.left - cur.left, dy = prev.top - cur.top;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.getBoundingClientRect(); // 强制回流,让起点生效
        requestAnimationFrame(() => {
          el.style.transition = `transform ${dur}ms ${ease}`;
          el.style.transform = "";
          const clean = () => { el.style.transition = ""; el.removeEventListener("transitionend", clean); };
          el.addEventListener("transitionend", clean);
        });
      }
      rects.current[id] = cur;
    });
  }, [signature]);
}
