// Tests for amazon-image-viewer-arrow-keys.
//
//   node test/amazon-image-viewer-arrow-keys.test.js      (or bin/test.sh to run every test)
//
// The script is evaluated against a DOM stub holding the viewer and its thumbnails.
// A thumbnail click moves the `selected` class, as Amazon's own handler does.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/amazon-image-viewer-arrow-keys.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

// --- DOM stub ---------------------------------------------------------------

class Element {
  constructor({ tag = 'div', isContentEditable = false } = {}) {
    this.tag = tag;
    this.isContentEditable = isContentEditable;
    this.selected = false;
  }

  matches(selector) {
    if (selector !== '.selected') throw new Error(`the stub cannot match "${selector}"`);
    return this.selected;
  }

  closest(selector) {
    return selector.split(', ').includes(this.tag) ? this : null;
  }
}

function buildPage({ thumbCount = 4, selectedIndex = 0, viewerOpen = true } = {}) {
  const thumbs = Array.from({ length: thumbCount }, () => new Element());
  thumbs.forEach(thumb => {
    thumb.click = () => thumbs.forEach(other => { other.selected = other === thumb; });
  });
  if (thumbs[selectedIndex]) thumbs[selectedIndex].selected = true;

  const viewer = new Element();
  viewer.offsetParent = viewerOpen ? new Element() : null;

  const listeners = [];
  const warnings = [];
  const document = {
    querySelector: selector => (selector === '#ivMain' ? viewer : null),
    querySelectorAll: selector => (selector === '#ivThumbs .ivThumb[id^="ivImage_"]' ? thumbs : []),
  };
  const window = {
    addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
  };
  const console = { warn: message => warnings.push(message) };

  vm.runInNewContext(src, { window, document, Element, console });

  return {
    listeners,
    warnings,
    viewer,
    selected: () => thumbs.findIndex(thumb => thumb.selected),
    press(key, { target = new Element(), ...modifiers } = {}) {
      const event = { key, target, defaultPrevented: false, ...modifiers };
      event.preventDefault = () => { event.defaultPrevented = true; };
      event.stopPropagation = () => {};
      listeners.filter(l => l.type === 'keydown').forEach(l => l.handler(event));
      return event;
    },
  };
}

// --- cases ------------------------------------------------------------------

{
  const page = buildPage();
  check('listens on keydown in the capture phase', page.listeners.map(l => [l.type, l.capture]), [['keydown', true]]);
}

{
  const page = buildPage({ selectedIndex: 1 });
  const event = page.press('ArrowRight');
  check('ArrowRight selects the next image', page.selected(), 2);
  check('a handled arrow is prevented', event.defaultPrevented, true);
  page.press('ArrowLeft');
  page.press('ArrowLeft');
  check('ArrowLeft selects the previous image', page.selected(), 0);
}

{
  const page = buildPage({ selectedIndex: 3 });
  page.press('ArrowRight');
  check('ArrowRight on the last image wraps to the first', page.selected(), 0);
  page.press('ArrowLeft');
  check('ArrowLeft on the first image wraps to the last', page.selected(), 3);
}

{
  const page = buildPage({ viewerOpen: false });
  const event = page.press('ArrowRight');
  check('a closed viewer ignores arrows', [page.selected(), event.defaultPrevented], [0, false]);
}

{
  const page = buildPage();
  page.press('ArrowRight', { metaKey: true });
  page.press('ArrowRight', { shiftKey: true });
  page.press('ArrowRight', { target: new Element({ tag: 'input' }) });
  page.press('ArrowRight', { target: new Element({ isContentEditable: true }) });
  page.press('ArrowRight', { target: new Element({ tag: '.vjs-control-bar' }) });
  page.press('ArrowDown');
  check('modifiers, text fields, video controls and other keys are left alone', page.selected(), 0);
}

{
  const page = buildPage({ thumbCount: 1 });
  const event = page.press('ArrowRight');
  check('a single image leaves the arrow to the page', [page.selected(), event.defaultPrevented], [0, false]);
}

{
  const page = buildPage({ selectedIndex: -1 });
  page.press('ArrowRight');
  page.press('ArrowRight');
  check('no selected thumbnail warns once and selects nothing', [page.warnings.length, page.selected()], [1, -1]);
}

if (failures) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
