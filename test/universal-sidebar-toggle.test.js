// Tests for universal-sidebar-toggle: which button the chord presses on each site.
//
//   node test/universal-sidebar-toggle.test.js      (or bin/test.sh to run every test)
//
// Each case is a sidebar state read off the live site on 2026-11-25: the buttons
// present, their attributes, and whether they have a size. The chord must press
// the one button that toggles the sidebar in that state, and nothing else.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/universal-sidebar-toggle.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

/**
 * Matches the selector shapes the config uses: `tag.class[attr="v"][attr]`, with
 * an optional tag, any number of classes and attribute tests. Anything else throws,
 * so a new selector shape in the script has to be taught to this matcher on purpose.
 */
function matches(node, selector) {
  const m = /^([a-z]*)((?:\.[\w-]+)*)((?:\[[\w-]+(?:="[^"]*")?\])*)$/.exec(selector);
  if (!m) throw new Error(`fake matcher does not know "${selector}"`);
  const [, tag, classes, attrs] = m;
  if (tag && node.tag !== tag) return false;
  for (const cls of classes.split('.').filter(Boolean)) if (!(node.classes ?? []).includes(cls)) return false;
  for (const [, name, value] of attrs.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    if (!(name in node.attrs)) return false;
    if (value !== undefined && node.attrs[name] !== value) return false;
  }
  return true;
}

/** Boots the script on `host` with these buttons, presses the chord, returns the names of the buttons it pressed. */
function press(host, buttons) {
  const pressed = [];
  const warnings = [];
  const nodes = buttons.map(b => ({
    tag: 'button', attrs: {}, width: 30, ...b,
    getBoundingClientRect() { return { width: this.width, height: this.width ? 30 : 0 }; },
    click() { pressed.push(this.name); },
    focus() {},
    // Docs (mouse sequence) and ChatGPT (pointer sequence) dispatch instead of click().
    dispatchEvent(event) { if (event.type === 'click' || event.type === 'pointerdown') pressed.push(this.name); },
    parentElement: null,
  }));
  let onKey = null;
  const document = {
    body: {},
    querySelector: s => nodes.find(n => matches(n, s)) ?? null,
    addEventListener: (type, fn) => { if (type === 'keydown') onKey = fn; },
  };
  const window = { addEventListener() {}, getComputedStyle: n => n.style ?? { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' } };
  window.top = window;
  class FakeEvent { constructor(type) { this.type = type; } }
  vm.runInNewContext(src, {
    document, window, location: { hostname: host },
    MouseEvent: FakeEvent, PointerEvent: FakeEvent,
    setTimeout: fn => fn(),
    console: { warn: (...a) => warnings.push(a.join(' ')), error: (...a) => { throw new Error(a.join(' ')); } },
  });
  onKey?.({ metaKey: true, shiftKey: true, ctrlKey: true, altKey: true, code: 'KeyS', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
  // ChatGPT's pointer sequence ends in a click() as well; count each button once.
  return { pressed: [...new Set(pressed)], warnings };
}

// claude.ai: one button that relabels itself.
check('claude.ai, sidebar open: Hide sidebar',
  press('claude.ai', [{ name: 'hide', attrs: { 'aria-label': 'Hide sidebar' } }]).pressed, ['hide']);
check('claude.ai, sidebar hidden: Show sidebar',
  press('claude.ai', [{ name: 'show', attrs: { 'aria-label': 'Show sidebar', 'aria-expanded': 'false', 'data-testid': 'sidebar-compact-trigger' } }]).pressed, ['show']);

// ChatGPT: one "Toggle sidebar" button, and aria-expanded is stale.
for (const host of ['chatgpt.com', 'chat.openai.com']) {
  check(`${host}: Toggle sidebar, whatever aria-expanded says`,
    press(host, [
      { name: 'project-options', attrs: { 'aria-label': 'Project sidebar options' } },
      { name: 'toggle', attrs: { 'aria-label': 'Toggle sidebar', 'aria-controls': 'app-shell-sidebar', 'aria-expanded': 'true' } },
    ]).pressed, ['toggle']);
}

// Gemini: the toggle relabels itself, and a zero-width decoy shares one label.
const decoy = { name: 'sparkle', width: 0, attrs: { 'aria-label': 'Open sidebar', 'data-test-id': 'side-nav-sparkle-button' } };
check('gemini, sidebar open: Close sidebar, hidden until hover, past the decoy',
  press('gemini.google.com', [decoy, { name: 'toggle', attrs: { 'aria-label': 'Close sidebar', 'aria-expanded': 'true' }, style: { visibility: 'hidden' } }]).pressed, ['toggle']);
check('gemini, sidebar closed: the Open sidebar that has aria-expanded',
  press('gemini.google.com', [{ ...decoy, width: 0 }, { name: 'toggle', attrs: { 'aria-label': 'Open sidebar', 'aria-expanded': 'false' } }]).pressed, ['toggle']);

// Google Docs: separate elements for open and closed, the absent one at zero width.
check('docs, outline open: Hide tabs & outlines',
  press('docs.google.com', [
    { name: 'hide', tag: 'div', width: 60, attrs: { 'aria-label': 'Hide tabs & outlines', role: 'button' } },
    { name: 'show', width: 0, attrs: { 'aria-label': 'Show tabs & outlines' } },
  ]).pressed, ['hide']);
check('docs, outline closed: Show tabs & outlines',
  press('docs.google.com', [
    { name: 'hide', tag: 'div', width: 0, attrs: { 'aria-label': 'Hide tabs & outlines', role: 'button' } },
    { name: 'show', width: 36, attrs: { 'aria-label': 'Show tabs & outlines' } },
  ]).pressed, ['show']);

// Sites verified unchanged on the same day.
check('cloudflare: classic-sidebar-nav-trigger',
  press('dash.cloudflare.com', [{ name: 'trigger', attrs: { 'data-testid': 'classic-sidebar-nav-trigger', 'aria-label': 'Collapse sidebar' } }]).pressed, ['trigger']);
check('singlestore, expanded: the collapse button',
  press('portal.singlestore.com', [{ name: 'collapse', classes: ['navigation-sidebar__collapse-button'], attrs: { 'aria-label': 'Collapse sidebar' } }]).pressed, ['collapse']);
check('gmail: Main menu', press('mail.google.com', [{ name: 'menu', tag: 'div', attrs: { 'aria-label': 'Main menu' } }]).pressed, ['menu']);
check('calendar: Main drawer', press('calendar.google.com', [{ name: 'drawer', tag: 'div', attrs: { 'aria-label': 'Main drawer' } }]).pressed, ['drawer']);

const missing = press('claude.ai', [{ name: 'other', attrs: { 'aria-label': 'New chat' } }]);
check('no toggle: presses nothing and warns, naming the selectors', [missing.pressed, missing.warnings.length, missing.warnings[0]?.includes('Hide sidebar')], [[], 1, true]);
check('an unlisted site: the script stays out', press('example.com', [{ name: 'x', attrs: {} }]).pressed, []);

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
