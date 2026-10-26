#!/usr/bin/env bash
# 用 build.mjs 重建学习库首页（嵌入最新 X 简报 / 海报）。供 x-brief 与海报发布脚本调用。
# 用法：LEARNING_ROOT=/path bash scripts/rebuild-home.sh
# 2026-10-26 起构建失败就停发：缺目录、缺 build.mjs、缺 node 或 build.mjs 报错，都打印原因并以非零退出，
# 调用方据此不提交、不推送（以前是只告警、退出 0，可能把半套页面推上线）。
set -u
ROOT="${LEARNING_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
fail() { echo "error: $1；首页没有重建，停止发布" >&2; exit "${2:-1}"; }
cd "$ROOT" 2>/dev/null || fail "进不去目录 $ROOT"
[[ -f build.mjs ]] || fail "$ROOT 里没有 build.mjs"
command -v node >/dev/null 2>&1 || fail "找不到 node"
node build.mjs
rc=$?
[[ $rc -eq 0 ]] || fail "build.mjs 失败（退出 $rc，原因见上面的输出）" "$rc"
echo "rebuilt learning homepage ($ROOT/index.html)"
