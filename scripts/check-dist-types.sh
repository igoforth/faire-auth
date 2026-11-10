#!/usr/bin/env bash
set -euo pipefail

# Fails when built declarations lost their types. The TypeScript 7 dts
# generator runs with --noCheck, so an unresolved import (for example a
# project reference whose declarations were never built) silently becomes
# `any` instead of failing the build.

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
status=0

fail() {
	echo "::error file=$1::$2"
	status=1
}

shared="$root/packages/faire-auth/dist/shared.d.mts"
if [[ ! -s "$shared" ]]; then
	fail "$shared" "missing or empty"
elif grep -Eq 'declare const [A-Za-z]+Route: any;' "$shared"; then
	fail "$shared" "route declarations were emitted as any: $(grep -Eo 'declare const [A-Za-z]+Route: any;' "$shared" | head -3 | tr '\n' ' ')"
fi

for pkg in expo stripe; do
	index="$root/packages/$pkg/dist/index.d.mts"
	if [[ ! -s "$index" ]]; then
		fail "$index" "missing or empty"
	elif ! grep -Eq "id: \"$pkg\"" "$index" && ! grep -rEq "id: \"$pkg\"" "$root/packages/$pkg/dist" --include='*.d.mts'; then
		fail "$index" "plugin id literal \"$pkg\" was widened (declarations lost their types)"
	fi
done

if [[ $status -eq 0 ]]; then
	echo "dist declarations kept their types"
fi
exit $status
