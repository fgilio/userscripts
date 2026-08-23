#!/usr/bin/env bash
# Push a userscript into Tampermonkey.
#
# Chrome refuses to install from file:// and the Tampermonkey editor is a
# chrome-extension:// page that cannot be automated, so this serves the file
# over localhost for one request. Tampermonkey shows its install/update prompt.
# The script is also copied to the clipboard as a fallback.
#
# Only needed to install an edit you have made locally. To install a script as
# published, click its link in README.md instead: Tampermonkey handles the raw
# GitHub URL directly, and @updateURL keeps it current from then on.
#
# macOS, Linux and WSL. The clipboard copy and the browser launch are both
# best-effort: if neither tool is present the URL is printed for you to open.
#
# Usage: bin/install.sh scripts/<name>.user.js
set -euo pipefail

file="${1:?usage: bin/install.sh scripts/<name>.user.js}"
[ -f "$file" ] || { echo "Unable to find userscript at: $file" >&2; exit 1; }

dir=$(cd "$(dirname "$file")" && pwd)
base=$(basename "$file")
port=${PORT:-8931}

# Nothing reaches the browser unlinted. check.sh passing is step 1 of the
# "done" checklist in CLAUDE.md, and this is the command that makes it real.
"$(dirname "$0")/check.sh" "$dir/$base"

# First clipboard tool that exists wins. Absent on a bare container, which is
# not a reason to fail: the localhost URL below is the real install path.
copy_to_clipboard() {
  local tool
  for tool in pbcopy wl-copy xclip xsel clip.exe; do
    command -v "$tool" >/dev/null 2>&1 || continue
    case "$tool" in
      xclip) xclip -selection clipboard < "$file" ;;
      xsel)  xsel --clipboard --input < "$file" ;;
      *)     "$tool" < "$file" ;;
    esac
    echo "Copied to clipboard with $tool (fallback: paste into a new Tampermonkey script, save)."
    return 0
  done
  echo "note: no clipboard tool found (tried pbcopy, wl-copy, xclip, xsel, clip.exe)."
}

open_url() {
  local tool
  for tool in open xdg-open wslview; do
    if command -v "$tool" >/dev/null 2>&1; then
      "$tool" "$1" >/dev/null 2>&1 && return 0
    fi
  done
  echo "note: could not launch a browser. Open the URL above yourself."
}

copy_to_clipboard

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$dir" >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null' EXIT
sleep 1

url="http://127.0.0.1:$port/$base"
echo "Serving $url"
open_url "$url"

echo "Tampermonkey should prompt to install or update. Press Return when done."
read -r
