// 【抓"用了但没声明的变量"】——build 抓不到这种错:它是合法语法,只在运行时才 ReferenceError。
// 2026-08 真实事故(两次):
//   ① 回退改动时误删了 `const rectRef = useRef(null);`,三处仍在用 → 一落笔就 ReferenceError;
//   ② 一次脚本替换把整块代码删掉了(含 `useEffect(()=>{setup()},[])` 与 `penErasing 函数`),
//      画布从此不初始化 → 完全写不了字。两次 next build 都一路绿灯。
// ★曾试图把检查扩到"被调用但未定义的函数",但正则做不了作用域分析,误报 37~194 条
//   (单字母箭头参数、atob 等浏览器全局、字符串里的 CSS/SQL),故只保留 xxxRef 这条【零误报】的。
//   函数被误删这类,靠的是【改完必须 git diff 复看删掉了什么】——本次就是这么揪出来的。
// 做法:对每个组件文件,收集 `xxxRef` / `setXxx` 这类【本文件内定义的局部标识符】的使用与声明,
// 只要用到却从没声明过就报错。刻意做得保守:只查这两类高频命名,避免误报。
import fs from "fs";
import path from "path";

const roots = ["components", "app", "lib"];
const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); }
    else if (/\.jsx?$/.test(f.name)) files.push(p);
  }
};
for (const r of roots) { try { walk(r); } catch {} }

let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  // 候选:本项目里大量使用的 useRef/useState 变量命名
  const used = new Set([...code.matchAll(/\b([a-z][A-Za-z0-9]*Ref)\s*\./g)].map((m) => m[1]));
  if (!used.size) continue;
  for (const name of used) {
    const declared = new RegExp(`(?:const|let|var)\\s+${name}\\b|function\\s+${name}\\b|\\b${name}\\s*(?:,|\\})[^=]*=\\s*(?:useRef|require)|\\(\\s*${name}\\b|,\\s*${name}\\b`).test(code)
      || new RegExp(`\\b${name}\\b\\s*=[^=]`).test(code);
    if (!declared) {
      console.error(`❌ ${f}: 用到了 \`${name}\` 但本文件里【从未声明】—— 运行时会 ReferenceError(build 抓不到)`);
      bad++;
    }
  }
}
if (bad) { console.error(`\n❌ 共 ${bad} 处未声明的引用。`); process.exit(1); }
console.log("✅ 未声明变量检查通过(xxxRef 类)");
