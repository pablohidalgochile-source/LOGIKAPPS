#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CLANG_MODULE_CACHE_PATH="$ROOT/.build/module-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="$ROOT/.build/module-cache"
swift build --disable-sandbox --cache-path "$ROOT/.build/cache" --scratch-path "$ROOT/.build"
BIN="$(swift build --disable-sandbox --cache-path "$ROOT/.build/cache" --scratch-path "$ROOT/.build" --show-bin-path)"
"$BIN/SubscriptionChecks"
