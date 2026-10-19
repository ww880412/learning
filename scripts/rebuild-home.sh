#!/usr/bin/env bash
# 用 build.mjs 重建学习库首页（嵌入最新 X 简报 / 海报）。供 x-brief 与海报发布脚本调用。
# 用法：LEARNING_ROOT=/path bash scripts/rebuild-home.sh
# 缺 node 或 build.mjs 时只告警、不失败（退出 0）。
set -u
ROOT="${LEARNING_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT" || { echo "warn: cannot cd $ROOT; homepage not rebuilt" >&2; exit 0; }
if [[ ! -f build.mjs ]]; then echo "warn: no build.mjs in $ROOT; homepage not rebuilt" >&2; exit 0; fi
if ! command -v node >/dev/null 2>&1; then echo "warn: node not found; homepage not rebuilt" >&2; exit 0; fi
if node build.mjs; then echo "rebuilt learning homepage ($ROOT/index.html)"; else echo "warn: build.mjs failed; homepage may be stale" >&2; fi
exit 0
