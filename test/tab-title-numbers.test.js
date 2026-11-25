// Tests for github-tab-title-numbers: the number prefix and the CI marker.
//
//   node test/tab-title-numbers.test.js      (or bin/test.sh to run every test)
//
// The script runs against a fake page holding either the redesigned merge box
// (progress segments tagged data-testid="checks-progress-<kind>", verified
// 2026-11-25) or the old one (a verdict sentence in an <h3>). The fake answers only
// the selectors the script uses, and throws on any other.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/github-tab-title-numbers.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

const SEGMENT = '[data-testid="mini-status"] [data-testid^="checks-progress-"]';
const TITLE = 'Fix the thing by fgilio · Pull Request #549 · publicala/volpe';

/** Runs the script on `path` with these segment kinds and <h3> texts. Returns the title it wrote and its warnings. */
function titleFor({ path = '/publicala/volpe/pull/549', segments = [], headings = [] } = {}) {
  const warnings = [];
  const segmentNodes = segments.map(kind => ({ getAttribute: name => (name === 'data-testid' ? `checks-progress-${kind}` : null) }));
  const headingNodes = headings.map(textContent => ({ textContent }));
  const document = {
    title: TITLE,
    head: { querySelector: s => (s === 'title' ? {} : null) },
    body: {},
    documentElement: {},
    querySelector(selector) {
      if (selector === 'main') return null;
      throw new Error(`fake document.querySelector() does not know "${selector}"`);
    },
    querySelectorAll(selector) {
      if (selector === SEGMENT) return segmentNodes;
      if (selector === 'h3') return headingNodes;
      throw new Error(`fake document.querySelectorAll() does not know "${selector}"`);
    },
    addEventListener() {},
  };
  vm.runInNewContext(src, {
    document,
    location: { pathname: path },
    history: { pushState() {}, replaceState() {} },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    Promise,
    RegExp,
    setTimeout() {},
    console: { warn: (...a) => warnings.push(a.join(' ')), error: (...a) => { throw new Error(a.join(' ')); } },
  });
  return { title: document.title, warnings };
}

const t = opts => titleFor(opts).title;

// Redesigned merge box, kinds exactly as read off live PRs on 2026-11-25.
check('a failing PR gets ✗', t({ segments: ['success', 'skipped', 'optional-failure', 'required-failure'] }), `✗ #549 - ${TITLE}`);
check('only an optional failure still gets ✗', t({ segments: ['success', 'optional-failure'] }), `✗ #549 - ${TITLE}`);
check('a check needing attention gets ✗', t({ segments: ['success', 'skipped', 'attention-required'] }), `✗ #549 - ${TITLE}`);
check('a pending PR gets …', t({ segments: ['success', 'skipped', 'neutral', 'pending'] }), `… #549 - ${TITLE}`);
check('a green PR gets ✓', t({ segments: ['success', 'skipped'] }), `✓ #549 - ${TITLE}`);
check('neutral and skipped are still a pass', t({ segments: ['success', 'neutral', 'skipped'] }), `✓ #549 - ${TITLE}`);
check('failure outranks pending', t({ segments: ['pending', 'required-failure'] }), `✗ #549 - ${TITLE}`);

const unknown = titleFor({ segments: ['success', 'sparkly'] });
check('an unknown kind is never a pass', unknown.title, `#549 - ${TITLE}`);
check('an unknown kind warns, naming it', unknown.warnings.length === 1 && unknown.warnings[0].includes('checks-progress-sparkly'), true);
check('an unknown kind does not hide a failure', t({ segments: ['sparkly', 'required-failure'] }), `✗ #549 - ${TITLE}`);

check('segments win over the expanded panel headings', t({ segments: ['success'], headings: ['in progress checks'] }), `✓ #549 - ${TITLE}`);

// Old merge box, still served behind the Preview toggle.
check('old box: failure sentence gets ✗', t({ headings: ['Some checks were not successful'] }), `✗ #549 - ${TITLE}`);
check('old box: pending sentence gets …', t({ headings: ["Some checks haven't completed yet"] }), `… #549 - ${TITLE}`);
check('old box: pass sentence gets ✓', t({ headings: ['All checks have passed'] }), `✓ #549 - ${TITLE}`);

check('no checks at all: number only', t(), `#549 - ${TITLE}`);
check('an issue gets the number and never a marker', t({ path: '/publicala/volpe/issues/12', segments: ['required-failure'] }), `#12 - ${TITLE}`);
check('a page with no number is left alone', t({ path: '/publicala/volpe' }), TITLE);

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
