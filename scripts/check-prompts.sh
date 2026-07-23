#!/usr/bin/env bash
# 提示词/工具描述里的【裸英文引号】会截断 JS 双引号字符串、导致 build 失败(2026-07 反复踩)。
# 教训:node --check 因 JS 的正则/除号歧义,在整文件里会【漏掉】这类错(单测才抓得到),不可靠。
# 所以改用 scripts/lint-quotes.mjs 做专门的词法扫描(跟踪 "/'/` 串与注释,双引号串闭合后紧跟中文=提前截断)。
# 用法:改完提示词先跑 `npm run check`,过了再 `npm run build`。
set -u
cd "$(dirname "$0")/.."
FILES=( lib/chatAgent.js lib/appGuide.js lib/scopeGuard.js lib/planReview.js lib/recipeRemap.js lib/provision.js lib/generators.js )
for f in lib/bricks/*.js; do FILES+=("$f"); done
node scripts/lint-quotes.mjs "${FILES[@]}"
