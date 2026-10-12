// Tests for github-pr-omnibox-shortcut.
//
//   node test/pr-omnibox-shortcut.test.js      (or bin/test.sh to run every test)
//
// The script is evaluated against a stub location holding a Google search URL.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/github-pr-omnibox-shortcut.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

function redirectFor(query, { sourceid = 'chrome' } = {}) {
  const params = new URLSearchParams({ q: query, oq: query });
  if (sourceid) params.set('sourceid', sourceid);
  params.set('ie', 'UTF-8');

  let replacedWith = null;
  const location = { search: `?${params}`, replace: url => { replacedWith = url; } };
  vm.runInNewContext(src, { location, URLSearchParams });
  return replacedWith;
}

check('repo#N opens the publicala PR', redirectFor('mentat#369'), 'https://github.com/publicala/mentat/pull/369');
check('repo/N opens the publicala PR', redirectFor('mentat/369'), 'https://github.com/publicala/mentat/pull/369');
check('owner/repo#N keeps the owner', redirectFor('fgilio/userscripts#12'), 'https://github.com/fgilio/userscripts/pull/12');
check('owner/repo/N keeps the owner', redirectFor('fgilio/userscripts/12'), 'https://github.com/fgilio/userscripts/pull/12');
check('dots, dashes and underscores in the repo', redirectFor('pla-stack.v2_x#7'), 'https://github.com/publicala/pla-stack.v2_x/pull/7');
check('surrounding spaces are trimmed', redirectFor('  mentat#369 '), 'https://github.com/publicala/mentat/pull/369');

check('a plain search stays a search', redirectFor('mentat comprar'), null);
check('a one-letter repo stays a search', redirectFor('c#10'), null);
check('a space before the number stays a search', redirectFor('mentat #369'), null);
check('a quoted query stays a search', redirectFor('"windows/10"'), null);
check('a non-numeric PR stays a search', redirectFor('mentat#abc'), null);
check('a deeper path stays a search', redirectFor('a/b/c/1'), null);
check("Google's own search box is never redirected", redirectFor('mentat#369', { sourceid: null }), null);
check('another sourceid is never redirected', redirectFor('mentat#369', { sourceid: 'navclient' }), null);

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
