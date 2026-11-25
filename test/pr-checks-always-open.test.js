// Tests for github-pr-checks-always-open.
//
//   node test/pr-checks-always-open.test.js      (or bin/test.sh to run every test)
//
// The script runs against a fake merge box: three tiles that behave as GitHub's
// accordion does (at most one open), built from the markup verified on 2026-11-25.
// The fake answers only the selectors the script uses, and throws on any other, so a
// selector change in the script fails here instead of silently matching nothing.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/github-pr-checks-always-open.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

const TILE = '[data-testid="mini-status"]';
const TOGGLE = 'button[aria-expanded]:not([tabindex="-1"]):not([data-testid])';

class Element {
  closest(selector) {
    if (selector !== TILE) throw new Error(`fake closest() does not know "${selector}"`);
    return this.tile ?? null;
  }
}

class Button extends Element {
  constructor(tile, attrs) {
    super();
    this.tile = tile;
    this.attrs = attrs;
    this.dataset = {};
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  /** Every button in a tile toggles it, exactly as on GitHub. */
  click() { this.tile.box.toggle(this.tile); }
}

/** One tile. `kind` is checks, comments or approvals. `toggles` is how many toggle buttons it has. */
class Tile extends Element {
  constructor(box, kind) {
    super();
    this.box = box;
    this.kind = kind;
    this.open = false;
    this.buttons = [];
    if (kind === 'approvals') return;
    // The title button (in the tab order), the summary and two progress segments.
    this.buttons.push(new Button(this, {}));
    this.buttons.push(new Button(this, { tabindex: '-1' }));
    this.buttons.push(new Button(this, { 'data-testid': 'checks-progress-success' }));
    this.buttons.push(new Button(this, { 'data-testid': 'checks-progress-pending' }));
    this.sync();
  }
  sync() {
    for (const button of this.buttons) {
      button.attrs['aria-expanded'] = String(this.open);
      if (this.kind === 'checks') button.dataset.telemetryAction = `pull_requests.checks.${this.open ? 'collapse' : 'expand'}`;
    }
  }
  contains(node) { return node.tile === this; }
  querySelector(selector) {
    const b = this.buttons;
    switch (selector) {
      case 'button[data-telemetry-action]': return b.find(x => x.dataset.telemetryAction) ?? null;
      case 'button[aria-expanded]': return b.find(x => x.attrs['aria-expanded']) ?? null;
      case TOGGLE: return b.find(x => x.attrs['aria-expanded'] && x.attrs.tabindex !== '-1' && !x.attrs['data-testid']) ?? null;
    }
    throw new Error(`fake tile.querySelector() does not know "${selector}"`);
  }
}

class MergeBox {
  constructor({ checks = true } = {}) {
    this.tiles = [...(checks ? ['checks'] : []), 'comments', 'approvals'].map(kind => new Tile(this, kind));
    this.clicks = 0;
  }
  tile(kind) { return this.tiles.find(t => t.kind === kind); }
  toggle(tile) {
    this.clicks++;
    const opening = !tile.open;
    for (const t of this.tiles) { t.open = false; t.sync(); }
    tile.open = opening;
    tile.sync();
  }
  state() { return Object.fromEntries(this.tiles.filter(t => t.kind !== 'approvals').map(t => [t.kind, t.open])); }
}

/** Boots the script on `path` with `box` (or no merge box yet). Returns handles to drive it. */
function boot(path, box = null) {
  const timers = [];
  const listeners = {};
  let observer = null;
  const warnings = [];
  const page = { box };

  const document = {
    documentElement: {},
    querySelector(selector) {
      if (selector !== TILE) throw new Error(`fake document.querySelector() does not know "${selector}"`);
      return page.box?.tiles[0] ?? null;
    },
    querySelectorAll(selector) {
      if (selector === TILE) return page.box?.tiles ?? [];
      if (selector === `${TILE} button[aria-expanded="true"]`) {
        return (page.box?.tiles ?? []).flatMap(t => t.buttons.filter(b => b.attrs['aria-expanded'] === 'true'));
      }
      throw new Error(`fake document.querySelectorAll() does not know "${selector}"`);
    },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
  };

  const context = {
    document,
    location: { pathname: path },
    window: { addEventListener() {} },
    Element,
    MutationObserver: class { constructor(cb) { observer = cb; } observe() {} },
    setTimeout: fn => timers.push(fn),
    console: { warn: (...a) => warnings.push(a.join(' ')), error: (...a) => { throw new Error(a.join(' ')); } },
  };
  vm.runInNewContext(src, context);

  const flush = () => { while (timers.length) timers.shift()(); };
  flush();

  return {
    page,
    warnings,
    /** A DOM change: the observer fires and the debounce runs. */
    mutate() { observer(); flush(); },
    navigate(to, nextBox = page.box) { context.location.pathname = to; page.box = nextBox; observer(); flush(); },
    /** A real click on a tile, as the user makes it: trusted, captured, then the toggle runs. */
    userClick(kind) {
      const button = page.box.tile(kind).buttons[0];
      for (const fn of listeners.click ?? []) fn({ isTrusted: true, target: button });
      button.click();
      observer();
      flush();
    },
  };
}

const PR = '/publicala/volpe/pull/549';

{
  const box = new MergeBox();
  boot(PR, box);
  check('opens Checks on load', box.state(), { checks: true, comments: false });
}
{
  const box = new MergeBox();
  boot(`${PR}/`, box);
  check('a trailing slash is still the conversation page', box.state().checks, true);
}
{
  const box = new MergeBox();
  const run = boot(PR, box);
  for (let i = 0; i < 100; i++) run.mutate();
  check('idempotent: 100 more runs click nothing more', box.clicks, 1);
}
{
  const run = boot(PR, null);
  check('no merge box yet: does nothing, says nothing', run.warnings, []);
  const box = new MergeBox();
  run.navigate(PR, box);
  check('opens Checks once the merge box renders', box.state().checks, true);
}
{
  const box = new MergeBox();
  const run = boot(PR, box);
  run.userClick('checks');
  run.mutate();
  check('a hand collapse stays collapsed', box.state(), { checks: false, comments: false });
}
{
  const box = new MergeBox();
  const run = boot(PR, box);
  run.userClick('comments');
  run.mutate();
  check('opening Comments by hand is left alone', box.state(), { checks: false, comments: true });
  run.userClick('comments');
  run.mutate();
  check('closing Comments by hand does not bring Checks back', box.state(), { checks: false, comments: false });
}
{
  const box = new MergeBox();
  const run = boot(PR, box);
  run.userClick('checks');
  run.navigate(`${PR}/commits`, null);
  const back = new MergeBox();
  run.navigate(PR, back);
  check('Commits and back opens Checks again', back.state().checks, true);
}
{
  const box = new MergeBox();
  const run = boot(PR, box);
  run.userClick('checks');
  const other = new MergeBox();
  run.navigate('/publicala/volpe/pull/550', other);
  check('soft nav to another PR opens its Checks', other.state().checks, true);
}
{
  const box = new MergeBox();
  const run = boot(PR, box);
  box.toggle(box.tile('checks'));
  box.clicks = 0;
  run.mutate();
  check('GitHub collapsing it on its own is undone', [box.state().checks, box.clicks], [true, 1]);
}
{
  const box = new MergeBox();
  box.toggle(box.tile('comments'));
  box.clicks = 0;
  boot(PR, box);
  check('another tile already open is left alone', [box.state(), box.clicks], [{ checks: false, comments: true }, 0]);
}
{
  const box = new MergeBox({ checks: false });
  const run = boot(PR, box);
  check('a PR with no checks: no click, no warning', [box.clicks, run.warnings], [0, []]);
}
for (const path of [`${PR}/checks`, `${PR}/files`, `${PR}/commits`, '/publicala/volpe/pulls']) {
  const box = new MergeBox();
  boot(path, box);
  check(`idle on ${path.replace(PR, '…')}`, box.clicks, 0);
}
{
  const box = new MergeBox();
  for (const b of box.tile('checks').buttons) delete b.attrs['aria-expanded'];
  const run = boot(PR, box);
  run.mutate();
  check('a toggle that vanished warns once, naming the selector', [run.warnings.length, run.warnings[0]?.includes(TOGGLE)], [1, true]);
}

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
