#!/usr/bin/env bash
# Run every test in test/. No framework and no dependencies: each file is a plain
# node script that exits non-zero on failure.
#
# Usage: bin/test.sh
set -euo pipefail

cd "$(dirname "$0")/.."

shopt -s nullglob
tests=(test/*.test.js)
if [ ${#tests[@]} -eq 0 ]; then
  echo "No tests found in test/" >&2
  exit 1
fi

failed=0
for t in "${tests[@]}"; do
  echo "== $t"
  node "$t" || failed=1
done

[ $failed -eq 0 ] && echo -e "\nAll test files passed." || echo -e "\nSome tests failed." >&2
exit $failed
