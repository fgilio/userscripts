#!/usr/bin/env bash
# Push a userscript into Tampermonkey.
#
# Chrome refuses to install from file:// and the Tampermonkey editor is a
# chrome-extension:// page that cannot be automated, so this serves the file
# over localhost for one request — Tampermonkey shows its install/update prompt.
# The script is also copied to the clipboard as a fallback.
#
# Usage: bin/install.sh scripts/<name>.user.js
set -euo pipefail

file="${1:?usage: bin/install.sh scripts/<name>.user.js}"
[ -f "$file" ] || { echo "no such file: $file" >&2; exit 1; }

# Nothing reaches the browser unlinted — check.sh passing is step 1 of the
# "done" checklist in CLAUDE.md, and this is the command that makes it real.
"$(dirname "$0")/check.sh" "$(cd "$(dirname "$file")" && pwd)/$(basename "$file")" || exit 1

dir=$(cd "$(dirname "$file")" && pwd)
base=$(basename "$file")
port=${PORT:-8931}

pbcopy < "$file"
echo "Copied to clipboard (fallback: paste into a new Tampermonkey script, ⌘S)."

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dir" >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
sleep 1

url="http://127.0.0.1:$port/$base"
echo "Serving $url"
open "$url"

echo "Tampermonkey should prompt to install or update. Press Return when done."
read -r
