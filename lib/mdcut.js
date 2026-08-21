// 截断 Markdown/LaTeX 文本而不切坏它。
// 直接 slice 会把 $x^2$ 切成 "$x^" —— 单数个 $ 会让 KaTeX 把后面整段吞掉、渲染成一片红字。
// 这里的做法:切完数一下 $ 的个数,是奇数就补到下一个 $,补不到就把残缺那截丢掉。
export function safeCut(str, n) {
  const x = String(str || "");
  if (x.length <= n) return x;
  let c = x.slice(0, n);
  if (((c.match(/\$/g) || []).length % 2) === 1) {
    const nxt = x.indexOf("$", c.length);
    c = nxt >= 0 ? x.slice(0, nxt + 1) : c.replace(/\$[^$]*$/, "");
  }
  return c + "…";
}
