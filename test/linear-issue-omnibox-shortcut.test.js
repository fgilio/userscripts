// Tests for linear-issue-omnibox-shortcut.
//
//   node test/linear-issue-omnibox-shortcut.test.js      (or bin/test.sh to run every test)
//
// The script is evaluated against a stub location holding a Google search URL.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/linear-issue-omnibox-shortcut.user.js', 'utf8');

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

check('lKEY-N opens the issue', redirectFor('lFUL-698'), 'https://linear.app/publica/issue/FUL-698');
check('a two-letter key', redirectFor('lQA-12'), 'https://linear.app/publica/issue/QA-12');
check('a four-letter key', redirectFor('lSUPP-3'), 'https://linear.app/publica/issue/SUPP-3');
check('surrounding spaces are trimmed', redirectFor('  lDEV-5247 '), 'https://linear.app/publica/issue/DEV-5247');

check('a bare issue id stays a search', redirectFor('FUL-698'), null);
check('a lowercase key stays a search', redirectFor('lsd-25'), null);
check('a mixed-case key stays a search', redirectFor('lFul-698'), null);
check('an uppercase L stays a search', redirectFor('LFUL-698'), null);
check('a one-letter key stays a search', redirectFor('lB-52'), null);
check('a six-letter key stays a search', redirectFor('lABCDEF-1'), null);
check('a space after the l stays a search', redirectFor('l FUL-698'), null);
check('a non-numeric issue stays a search', redirectFor('lFUL-abc'), null);
check('a quoted query stays a search', redirectFor('"lFUL-698"'), null);
check("Google's own search box is never redirected", redirectFor('lFUL-698', { sourceid: null }), null);
check('another sourceid is never redirected', redirectFor('lFUL-698', { sourceid: 'navclient' }), null);

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
