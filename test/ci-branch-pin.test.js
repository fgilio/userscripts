// Tests for github-actions-ci-branch-pin: default branch detection.
//
//   node test/ci-branch-pin.test.js      (or bin/test.sh to run every test)
//
// The script is evaluated with no sidebar on the page, so apply() is a no-op.
// The "Re-detect default branch" menu command drives the lookup end to end:
// stubbed fetch in, GM_setValue out.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/github-actions-ci-branch-pin.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

function response(body, ok = true) {
  return { ok, text: async () => body, json: async () => JSON.parse(body) };
}

/** Branch the script caches for `home` (repo page HTML) and `refs` (branch list JSON). */
async function detect({ home, homeOk = true, refs = '{"refs":[]}' }) {
  const stored = {};
  const commands = {};
  const noop = () => {};
  vm.runInNewContext(src, {
    location: { pathname: '/acme/app/actions', search: '' },
    document: { querySelector: () => null, getElementById: () => null, documentElement: {}, addEventListener: noop },
    window: { addEventListener: noop },
    MutationObserver: class { observe() {} },
    setTimeout: noop,
    URLSearchParams,
    console: { warn: noop, error: noop },
    fetch: async (url) => (url.startsWith('/acme/app/refs') ? response(refs) : response(home, homeOk)),
    GM_getValue: (key, fallback) => stored[key] ?? fallback,
    GM_setValue: (key, value) => { stored[key] = value; },
    GM_registerMenuCommand: (name, fn) => { commands[name] = fn; },
  });
  commands['Re-detect default branch']();
  await new Promise((resolve) => setImmediate(resolve));
  const entry = stored['default-branch:acme/app'];
  return entry ? JSON.parse(entry).branch : null;
}

(async () => {
  check('JSON key', await detect({ home: '{"defaultBranch":"main","name":"app"}' }), 'main');
  check('JS literal key (GitHub, 2026-10)', await detect({ home: '{id:1,defaultBranch:"develop",name:"app"}' }), 'develop');
  check('escaped JSON inside a string', await detect({ home: '"{\\"defaultBranch\\":\\"trunk\\"}"' }), 'trunk');
  check('slash in the branch name', await detect({ home: 'defaultBranch:"release/v2"' }), 'release/v2');
  check('missing on the page falls back to the branch list',
    await detect({ home: '<html></html>', refs: '{"refs":["feature","master"]}' }), 'master');
  check('failed page load falls back to the branch list',
    await detect({ home: '', homeOk: false, refs: '{"refs":["main"]}' }), 'main');
  check('no answer anywhere caches nothing', await detect({ home: '<html></html>' }), null);

  if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
  }
})();
