#!/usr/bin/env bash
# 提示词/工具描述里的【裸英文引号】会截断 JS 双引号字符串、导致 build 失败(2026-07 反复踩)。
# node --check 只做语法解析(不解析 import、不执行),秒级抓出来,就是 build 会用的那套解析,
# 能精确命中"会炸的",不误报注释/反引号模板里的正常引号。用法:改完提示词先跑本脚本,过了再 build。
set -u
cd "$(dirname "$0")/.."
FILES=( lib/chatAgent.js lib/appGuide.js lib/scopeGuard.js lib/planReview.js lib/recipeRemap.js lib/provision.js lib/generators.js )
for f in lib/bricks/*.js; do FILES+=("$f"); done
fail=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  if ! out=$(node --check "$f" 2>&1); then
    echo "FAIL  $f"
    echo "$out" | grep -E "SyntaxError|Unexpected|Expected|\^" | head -4
    fail=1
  fi
done
[ "$fail" = 0 ] && echo "OK  提示词引号/语法检查通过（$(( ${#FILES[@]} )) 个文件）"
exit $fail
