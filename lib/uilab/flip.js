"use client";
// FLIP 位移动画:排列变化时,让带 data-flip 的元素从"旧位置"滑到"新位置"。
// 用 Web Animations API(element.animate)播放,不残留内联 transform,即使标签页被切后台也不会卡住位移。
// 布局编辑器现在用它;将来放置表的移动(导航栏/更多/分区之间)也复用它,让用户看清东西从哪挪到哪。
import { useRef, useLayoutEffect } from "react";

export function useFlip(rootRef, signature, opts = {}) {
  const dur = opts.duration || 260;
  const ease = opts.ease || "cubic-bezier(.2,.85,.25,1)";
  const override = opts.override; // ref:{ current:{ [id]:DOMRect } } —— 松手时的视觉起点(光标处)
  const rects = useRef({});
  const first = useRef(true);
  useLayoutEffect(() => {
    const root = rootRef.current; if (!root) return;
    const els = root.querySelectorAll("[data-flip]");
    const skip = first.current; first.current = false; // 首次只记录位置,不动画
    els.forEach((el) => {
      const id = el.getAttribute("data-flip"); if (!id) return;
      const cur = el.getBoundingClientRect();
      let prev = rects.current[id];
      if (override && override.current && override.current[id]) { prev = override.current[id]; delete override.current[id]; }
      if (!skip && prev && (Math.abs(prev.left - cur.left) > 0.5 || Math.abs(prev.top - cur.top) > 0.5) && typeof el.animate === "function") {
        const dx = prev.left - cur.left, dy = prev.top - cur.top;
        try {
          el.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
            { duration: dur, easing: ease }
          );
        } catch {}
      }
      rects.current[id] = cur;
    });
  }, [signature]);
}
