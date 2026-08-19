// 重新打包 /welcome 用的楷体子集(霞鹜文楷 LXGW WenKai · OFL)。
// ★什么时候要跑:【改过 welcome 页的中文文案之后】。子集只含当时用到的字,新字不重跑就会缺字形、
//   在页面上掉回默认字体(看起来又变回宋体/黑体),而且不会报错——所以别忘。
// 用法: npm i -D lxgw-wenkai-webfont && pip install fonttools brotli && node scripts/build-kai-subset.mjs
// 实现:①扫 app/welcome/page.js 里所有非 ASCII 字符 ②从 npm 包的 97 个分区子集里挑出含这些字的
//      ③各自再抽成只含所需字的小片 ④合并成一个 woff2 → public/fonts/LXGWWenKai-welcome.woff2
import { execFileSync } from "child_process";
import fs from "fs";
const PY = `
import os, re, glob, sys
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from fontTools.merge import Merger
src = open("app/welcome/page.js", encoding="utf-8").read()
want = set(ch for ch in src if ord(ch) > 0x2000)
pkg = "node_modules/lxgw-wenkai-webfont/files"
if not os.path.isdir(pkg): sys.exit("缺少 lxgw-wenkai-webfont,先 npm i -D lxgw-wenkai-webfont")
os.makedirs("/tmp/kaiwork", exist_ok=True)
parts = []
for i, f in enumerate(sorted(glob.glob(pkg + "/lxgwwenkai-regular-subset-*.woff2"))):
    try:
        ft = TTFont(f); cm = set(ft.getBestCmap().keys())
        keep = {c for c in want if ord(c) in cm}
        if not keep: ft.close(); continue
        o = Options(); o.layout_features = ["*"]; o.notdef_outline = True; o.name_IDs = ["*"]
        sb = Subsetter(options=o); sb.populate(text="".join(sorted(keep))); sb.subset(ft)
        p = "/tmp/kaiwork/p%d.ttf" % i; ft.flavor = None; ft.save(p); ft.close(); parts.append(p)
    except Exception as e: print("跳过", f, e)
merged = Merger().merge(parts); merged.save("/tmp/kaiwork/m.ttf")
mf = TTFont("/tmp/kaiwork/m.ttf"); mf.flavor = "woff2"
mf.save("public/fonts/LXGWWenKai-welcome.woff2"); mf.close()
cm = set(TTFont("public/fonts/LXGWWenKai-welcome.woff2").getBestCmap().keys())
miss = [c for c in sorted(want) if ord(c) not in cm]
print("字符 %d,子片 %d,体积 %d KB,未覆盖 %d 个(通常是 emoji): %s" % (
    len(want), len(parts), os.path.getsize("public/fonts/LXGWWenKai-welcome.woff2")//1024, len(miss), "".join(miss[:30])))
`;
fs.writeFileSync("/tmp/_kai.py", PY);
execFileSync("python3", ["/tmp/_kai.py"], { stdio: "inherit" });
