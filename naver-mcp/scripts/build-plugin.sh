#!/usr/bin/env bash
# naver.plugin 만들기: 서버를 파일 하나로 묶고 plugin/ 템플릿과 함께 압축한다.
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-$PWD/dist}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -r plugin/. "$work/"
npx --yes esbuild@0.28.2 src/server.js --bundle --platform=node --format=esm --target=node20 \
  --external:playwright --log-level=warning --outfile="$work/server/server.mjs" \
  --banner:js="import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"
mkdir -p "$out"
rm -f "$out/naver.plugin"
(cd "$work" && zip -qr "$out/naver.plugin" . -x '*.DS_Store')
echo "$out/naver.plugin"
