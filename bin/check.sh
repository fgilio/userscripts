#!/usr/bin/env bash
# Lint userscripts: metadata completeness, JS syntax, known footguns.
#
# Usage: bin/check.sh [file ...]   default: _template.user.js and scripts/*.user.js
#        (scripts/retired/ is excluded, because retired scripts are allowed to be broken)
#
# Accept a finding by putting this line anywhere in the script:
#     // check-ignore: <rule> why it is fine here
# The reason is mandatory. An unknown rule name, or an ignore for a rule that
# never fired, is an error. A suppression that silently does nothing is worse
# than no suppression at all.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
files=("$@")
[ ${#files[@]} -eq 0 ] && files=(_template.user.js scripts/*.user.js)

# The rule vocabulary. Every WARN below names one of these, and check-ignore
# accepts nothing else.
RULES=(semver wildcard-match icon prompt raf body-start noframes tag debounce)
REQUIRED=(name namespace version description author match run-at grant)

IGNORE_RE='^[[:space:]]*//[[:space:]]*check-ignore:[[:space:]]*([a-z-]+)([[:space:]]+[^[:space:]].*)?$'

fail=0
warn=0

for f in "${files[@]}"; do
  name=$(basename "$f")
  msgs=()      # "ERR  text" (always reported)
  finds=()     # "rule|text" (reported unless ignored)
  ignored=()

  block=$(sed -n '/==UserScript==/,/==\/UserScript==/p' "$f")
  if [ -z "$block" ]; then
    printf '\033[31mFAIL\033[0m %s\n      ERR  no metadata block. Every script must open with // ==UserScript== and close with // ==/UserScript==\n' "$name"; fail=1; continue
  fi

  # --- check-ignore pragmas: one pass, validating name and reason together ---
  while IFS= read -r line; do
    if [[ ! "$line" =~ $IGNORE_RE ]]; then
      msgs+=("ERR  malformed check-ignore:${line#*//}")
      continue
    fi
    rule="${BASH_REMATCH[1]}"
    reason="${BASH_REMATCH[2]:-}"
    if [[ " ${RULES[*]} " != *" $rule "* ]]; then
      msgs+=("ERR  check-ignore names unknown rule '$rule' (known: ${RULES[*]})")
    elif [ -z "$reason" ]; then
      msgs+=("ERR  check-ignore: $rule has no reason")
    else
      ignored+=("$rule")
    fi
  done < <(grep -E '^[[:space:]]*//[[:space:]]*check-ignore:' "$f")

  # --- metadata ---
  for key in "${REQUIRED[@]}"; do
    grep -qE "^// @$key[[:space:]]" <<<"$block" || msgs+=("ERR  the @$key metadata field is required")
  done

  ver=$(grep -E '^// @version' <<<"$block" | awk '{print $3}')
  [[ -n "$ver" && ! "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] &&
    finds+=("semver|@version '$ver' is not semver")

  grep -qE '^// @match[[:space:]]+https?://\*' <<<"$block" &&
    finds+=("wildcard-match|@match starts with a wildcard host. Narrow it to the paths you need")

  grep -qE '^// @icon[[:space:]]' <<<"$block" ||
    finds+=("icon|no @icon. The script is unidentifiable in the Tampermonkey list")

  grep -qE '^// @noframes' <<<"$block" ||
    finds+=("noframes|no @noframes. The script also runs in every iframe on the page")

  # --- body ---
  # Comments stripped, so prose *about* a footgun is not read as one. The @grant
  # scan uses the same stripped body, so a commented-out GM_ stub (CLAUDE.md
  # shows one for testing) cannot demand a grant it does not need.
  body=$(sed '/==UserScript==/,/==\/UserScript==/d' "$f" | sed 's;//.*$;;')

  for gm in $(grep -oE '\bGM_[a-zA-Z]+' <<<"$body" | sort -u); do
    grep -qE "^// @grant[[:space:]]+$gm\$" <<<"$block" || msgs+=("ERR  uses $gm without @grant $gm")
  done

  # window.alert(...) is the idiomatic spelling and must not slip through.
  grep -qE '(^|[^.[:alnum:]_])(window\.)?(alert|confirm|prompt)[[:space:]]*\(' <<<"$body" &&
    finds+=("prompt|alert/confirm/prompt blocks the page and freezes browser automation")

  grep -q 'requestAnimationFrame' <<<"$body" &&
    finds+=("raf|requestAnimationFrame does not fire in a background tab. Debounce with setTimeout")

  grep -qE 'observe\((document\.)?body' <<<"$body" && grep -q '@run-at *document-start' <<<"$block" &&
    finds+=("body-start|observes document.body at document-start, where body may still be null")

  grep -q 'console\.' <<<"$body" && ! grep -qE '^[[:space:]]*(const|let|var) TAG[[:space:]]*=' <<<"$body" &&
    finds+=("tag|a console call with no TAG const. Every message should name the script that wrote it")

  # An observer wired straight to the work function runs it on every mutation batch.
  observers=$(grep -c 'new MutationObserver(' <<<"$body")
  debounced=$(grep -c 'new MutationObserver(schedule)' <<<"$body")
  [ "$observers" -gt "$debounced" ] &&
    finds+=("debounce|a MutationObserver is not wired to schedule(). See CLAUDE.md \"SPA navigation\"")

  # node prints "<file>:<line>" then the offending source, then the reason.
  syntax=$(node --check "$f" 2>&1) ||
    msgs+=("ERR  $(grep -m1 -E '^[A-Za-z]*Error' <<<"$syntax") at $(head -1 <<<"$syntax")")

  # --- apply ignores, then report ignores that matched nothing ---
  # bash 3.2 expands an empty array under `set -u` only with the ${a[@]+...} guard.
  set -- ${ignored[@]+"${ignored[@]}"}
  fired=" "
  for find in "${finds[@]}"; do
    rule="${find%%|*}"
    fired+="$rule "
    [[ " $* " == *" $rule "* ]] ||
      msgs+=("WARN [$rule] ${find#*|}. To accept it: // check-ignore: $rule <reason>")
  done
  for rule in "$@"; do
    [[ "$fired" == *" $rule "* ]] ||
      msgs+=("ERR  check-ignore names rule '$rule', which does not fire in this file. Remove the pragma")
  done

  # --- report ---
  if [ ${#msgs[@]} -eq 0 ]; then
    printf '\033[32m  ok\033[0m %s\n' "$name"
  elif printf '%s\n' "${msgs[@]}" | grep -q '^ERR'; then
    printf '\033[31mFAIL\033[0m %s\n' "$name"; fail=1
    printf '      %s\n' "${msgs[@]}"
  else
    printf '\033[33mwarn\033[0m %s\n' "$name"; warn=1
    printf '      %s\n' "${msgs[@]}"
  fi
done

[ $fail -eq 0 ] && [ $warn -eq 0 ] && printf '\nAll clean.\n'
exit $fail
