// 专抓【双引号字符串被中文直引号提前截断】——node --check 因正则/除号歧义会漏,build(SWC)才报,太慢。
// 词法扫描:跟踪 " ' ` 串 与 // /* */ 注释;当一个 "…" 闭合后紧跟中文字符/中文标点,即判定为提前闭合(合法 JS 后面只会是 ASCII 标点/空白)。
import fs from "fs";
const files = process.argv.slice(2);
const isCJK = (c) => { const n = c.codePointAt(0); return (n>=0x3000&&n<=0x303f)||(n>=0x3400&&n<=0x9fff)||(n>=0xff00&&n<=0xffef)||(n>=0x2018&&n<=0x201f); };
let bad = 0;
for (const f of files) {
  let s; try { s = fs.readFileSync(f, "utf8"); } catch { continue; }
  let i = 0, line = 1, st = "code"; // code|dq|sq|tpl|lc|bc
  while (i < s.length) {
    const c = s[i], n = s[i+1];
    if (c === "\n") { line++; i++; continue; }
    if (st === "lc") { if (c === "\n") st = "code"; i++; continue; }
    if (st === "bc") { if (c === "*" && n === "/") { st = "code"; i += 2; continue; } i++; continue; }
    if (st === "dq") {
      if (c === "\\") { i += 2; continue; }
      if (c === '"') { // 双引号串闭合:看紧跟的字符
        st = "code";
        let j = i + 1;
        if (j < s.length && isCJK(s[j])) { console.log(`${f}:${line}  双引号串被提前闭合 → 后面紧跟中文「${s.slice(j, j+12)}」(把中文引用改成「」或全角引号)`); bad++; }
        i++; continue;
      }
      i++; continue;
    }
    if (st === "sq") { if (c === "\\") { i += 2; continue; } if (c === "'") st = "code"; i++; continue; }
    if (st === "tpl") { if (c === "\\") { i += 2; continue; } if (c === "`") st = "code"; i++; continue; }
    // st === code
    if (c === "/" && n === "/") { st = "lc"; i += 2; continue; }
    if (c === "/" && n === "*") { st = "bc"; i += 2; continue; }
    if (c === '"') { st = "dq"; i++; continue; }
    if (c === "'") { st = "sq"; i++; continue; }
    if (c === "`") { st = "tpl"; i++; continue; }
    i++;
  }
}
if (bad) { console.log(`\n❌ 发现 ${bad} 处双引号被中文提前截断`); process.exit(1); }
console.log("✅ 双引号字符串检查通过");
