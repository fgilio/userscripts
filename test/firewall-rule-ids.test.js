// Rule id lookup tests for laravel-cloud-firewall-rule-ids.
//
//   node test/firewall-rule-ids.test.js      (or bin/test.sh to run every test)
//
// No dependencies and no test framework, matching the rest of the repo. The
// lookup lives inside the script's IIFE, so it is reached the way a browser
// reaches it: the file is evaluated against a DOM stub real enough that apply()
// finds rule rows, reads the payload beside them, and writes an id line into
// the page. A stub too thin makes every assertion pass vacuously, so each case
// below asserts on an id a wrong implementation cannot print.
//
// The payloads are cut down from the shape cloud.laravel.com actually sends:
// one array per card, and the id that matches a Cloudflare log is
// provider_identifier, not the numeric id.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/laravel-cloud-firewall-rule-ids.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

// --- fixtures ---------------------------------------------------------------

const PATH = '/org/publica.la/network/zones/publicala.cloud';

function rule(name, providerIdentifier, extra) {
  return Object.assign({
    id: 93,
    identifier: 'nru-a269a235-1f1a-4593-af2a-87fd29aaee81',
    name,
    provider_identifier: providerIdentifier,
    type: 'firewall',
    is_active: true,
  }, extra);
}

const ZONE = {
  url: PATH,
  props: {
    firewallRules: [
      rule('Bypass WAF for Caddy servers traffic', 'e26440ac78ed42b4af7426de94e48c18'),
      rule('scrape-2026-08: Block definite bots (score 1, unverified)', '5c2f218233434dd28b8d8dd7e68ef13e'),
    ],
    rateLimitRules: [rule('api-2026-08: Rate limit the ED machine surface {cloud}', 'bcc4376301cc48d7ac1a41a7c86b696c', { type: 'rate_limit' })],
    cacheRules: [rule('Cache the reader assets', '7d1a0f2b9c344e15a0f4b2d6e8c91a37', { type: 'cache' })],
  },
};

const ZONE_NAMES = ZONE.props.firewallRules.map(r => r.name)
  .concat(ZONE.props.rateLimitRules[0].name, ZONE.props.cacheRules[0].name);

/** The payload of another page, left in the DOM by an Inertia navigation. */
const ELSEWHERE = { url: '/org/publica.la/network', props: { zones: [] } };

// --- DOM stub ---------------------------------------------------------------

function el(props = {}) {
  const node = {
    children: [], attributes: {}, dataset: {}, style: {}, className: '', textContent: '',
    parentElement: null,
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
    remove() {
      const siblings = this.parentElement ? this.parentElement.children : null;
      if (siblings) siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    },
    querySelector(selector) {
      if (!selector.includes('data-fg-rule-id')) return null;
      return this.children.find(child => child.getAttribute('data-fg-rule-id') !== null) || null;
    },
    closest: () => null,
    cloneNode() { return el({ tag: this.tag, className: this.className, attributes: Object.assign({}, this.attributes) }); },
    insertAdjacentElement(position, node) {
      const siblings = this.parentElement ? this.parentElement.children : null;
      if (position !== 'afterend' || !siblings) throw new Error(`the stub cannot insert ${position}`);
      node.parentElement = this.parentElement;
      siblings.splice(siblings.indexOf(this) + 1, 0, node);
      return node;
    },
    get firstElementChild() { return this.children[0] || null; },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    get childElementCount() { return this.children.length; },
  };
  return Object.assign(node, props);
}

/**
 * One rule row: a drag handle, and the three-child cell of action, name and
 * events it sits beside. The name arrives padded, the way the page renders it.
 */
function ruleRow(name) {
  const label = el({ textContent: `\n      ${name}\n    ` });
  const wrap = el({ children: [label] });
  const cell = el({ children: [el({ textContent: 'Block' }), wrap, el({ textContent: '1.5K events' })] });
  const row = el({ children: [el({ children: [el(), cell] })] });

  const handle = el();
  handle.closest = selector => (selector === '.group' ? row : null);
  return { handle, wrap, cell };
}

/**
 * The rule editor: the name field inside its control slot, and a description
 * the dialog already renders for another field, which the id line is cut from.
 */
function editor(name) {
  const input = el({ tag: 'input', value: name });
  const control = el({ attributes: { 'data-slot': 'control' }, children: [input] });
  const field = el({ children: [el({ tag: 'label', textContent: 'Rule name' }), control] });
  const description = el({
    tag: 'p',
    className: 'text-[13px] text-weak data-disabled:opacity-50',
    attributes: { 'data-slot': 'description' },
    textContent: 'When does the rule apply?',
  });

  input.parentElement = control;
  control.parentElement = field;
  input.closest = selector => (selector.includes('control') ? control : null);

  const dialog = el({ children: [field, description] });
  dialog.querySelector = selector => {
    if (selector === '#rule_name') return input;
    if (selector.includes('description')) return description;
    return null;
  };
  return { dialog, field, input };
}

async function boot({ names, editing = [], path = PATH, embedded = ZONE, respond } = {}) {
  const rows = (names || ZONE_NAMES).map(ruleRow);
  const editors = editing.map(editor);
  const payload = el({ textContent: JSON.stringify(embedded) });
  const warnings = [];
  const observers = [];
  const fetched = [];

  const document = {
    documentElement: el(),
    addEventListener() {},
    createElement: tag => el({ tag }),
    querySelectorAll(selector) {
      if (selector.includes('aria-roledescription')) return rows.map(row => row.handle);
      if (selector.includes('application/json')) return embedded ? [payload] : [];
      if (selector.includes('dialog')) return editors.map(open => open.dialog);
      return [];
    },
  };

  const context = {
    document,
    console: { warn: (...args) => warnings.push(args.join(' ')), error: (...args) => warnings.push(args.join(' ')) },
    location: { pathname: path, href: `https://cloud.laravel.com${path}` },
    fetch(href, init) {
      fetched.push(href);
      return respond(href, init);
    },
    DOMParser: class {
      parseFromString(html) {
        const node = el({ textContent: html });
        return { querySelectorAll: selector => (selector.includes('application/json') ? [node] : []) };
      }
    },
    MutationObserver: class {
      constructor(callback) { observers.push(callback); }
      observe() {}
    },
    setTimeout, clearTimeout,
  };
  context.addEventListener = () => {};
  context.window = context;

  vm.createContext(context);
  vm.runInContext(src, context);
  await settle();

  return {
    rows, editors, warnings, fetched,
    /** The id printed under the name field of an open editor. */
    editorId(index) {
      const line = editors[index].field.children.find(child => child.getAttribute('data-fg-rule-id') !== null);
      return line || null;
    },
    /** Fires the script's own MutationObserver, the way a re-render would. */
    async rerun() {
      for (const callback of observers) callback([]);
      await settle();
    },
    /** The id printed under a rule name, or null when the row carries none. */
    id(index) {
      const line = rows[index].wrap.children.find(child => child.getAttribute('data-fg-rule-id') !== null);
      return line ? line.textContent : null;
    },
    ids() { return rows.map((row, index) => this.id(index)); },
  };
}

/** Long enough for the script's 50 ms debounce, a fetch, and the pass after it. */
function settle() {
  return new Promise(resolve => setTimeout(resolve, 200));
}

function serve(page) {
  return async () => ({ ok: true, status: 200, text: async () => JSON.stringify(page) });
}

// --- cases ------------------------------------------------------------------

(async () => {
  // The payload in the page is the one the server wrote for this page, so the
  // ids come off it without asking the network for anything.
  const loaded = await boot({ respond: serve(ZONE) });
  check('every card gets its ids from the payload in the page', loaded.ids().join(' | '),
    'e26440ac78ed42b4af7426de94e48c18 | 5c2f218233434dd28b8d8dd7e68ef13e | ' +
    'bcc4376301cc48d7ac1a41a7c86b696c | 7d1a0f2b9c344e15a0f4b2d6e8c91a37');
  check('a fresh payload costs no request', loaded.fetched.length, 0);
  check('the id line wraps under the name', loaded.rows[0].wrap.style.flexWrap, 'wrap');
  check('the name cell still holds the three columns the page renders', loaded.rows[0].cell.childElementCount, 3);

  await loaded.rerun();
  check('a second pass leaves one id line per rule',
    loaded.rows.map(row => row.wrap.children.length).join(','), '2,2,2,2');
  check('a second pass changes no id', loaded.ids()[1], '5c2f218233434dd28b8d8dd7e68ef13e');

  // Arriving by Inertia navigation leaves another page's payload in the DOM.
  // Reading it would print nothing at best and another zone's ids at worst.
  const navigated = await boot({ embedded: ELSEWHERE, respond: serve(ZONE) });
  check('a payload describing another page is refused, and the zone page is fetched', navigated.fetched.length, 1);
  check('the fetched payload names the rules', navigated.ids()[1], '5c2f218233434dd28b8d8dd7e68ef13e');

  // The fetch is asked for once per set of unknown names, never once per
  // re-render. Laravel Cloud re-renders this table on every checkbox toggle.
  const missing = await boot({
    names: ZONE_NAMES.concat('scrape-2026-08: A rule added after this page loaded'),
    respond: serve(ZONE),
  });
  await missing.rerun();
  await missing.rerun();
  check('a rule the payload never names is fetched for once, not once per re-render', missing.fetched.length, 1);
  check('the rules the payload does name are still printed', missing.ids()[0], 'e26440ac78ed42b4af7426de94e48c18');
  check('the rule it does not name is left alone', missing.id(4), null);

  // Two rules may share a name. Neither id can be attributed to a row then, and
  // printing either one under both would be a lie a log search acts on.
  const twins = await boot({
    names: ['Block definite bots', 'Block definite bots'],
    embedded: {
      url: PATH,
      props: {
        firewallRules: [
          rule('Block definite bots', 'aaaa4376301cc48d7ac1a41a7c86b696c'),
          rule('Block definite bots', 'bbbb0f2b9c344e15a0f4b2d6e8c91a37'),
        ],
      },
    },
    respond: serve(ZONE),
  });
  check('two rules sharing a name print no id at all', JSON.stringify(twins.ids()), '[null,null]');
  check('an ambiguous name is not mistaken for a stale payload', twins.fetched.length, 0);

  // The editor is where a rule name is about to change, so the id has to come
  // off the name the dialog opened with and stay put after that.
  const editing = await boot({ editing: ['scrape-2026-08: Block definite bots (score 1, unverified)', ''], respond: serve(ZONE) });
  const line = editing.editorId(0);
  check('the editor prints the id under the name field', line && line.textContent, '5c2f218233434dd28b8d8dd7e68ef13e');
  check('the id line is cut from a description the dialog already renders',
    line && `${line.tag}.${line.className}`, 'p.text-[13px] text-weak data-disabled:opacity-50');
  check('it sits in the description slot, right after the control',
    line && `${line.getAttribute('data-slot')} at ${editing.editors[0].field.children.indexOf(line)}`, 'description at 2');
  check('the New rule dialog has no name to look up, so it gets nothing', editing.editorId(1), null);

  editing.editors[0].input.value = 'scrape-2026-08: Block definite bots, renamed';
  await editing.rerun();
  const renamed = editing.editorId(0);
  check('renaming the rule in the field does not take the id away', renamed && renamed.textContent, '5c2f218233434dd28b8d8dd7e68ef13e');
  check('and does not print a second one', editing.editors[0].field.children.length, 3);

  // The dialog can be open before the ids arrive. Deciding then would leave it
  // blank for as long as it stays open.
  const early = await boot({
    editing: ['Bypass WAF for Caddy servers traffic'],
    embedded: ELSEWHERE,
    respond: serve(ZONE),
  });
  const late = early.editorId(0);
  check('an editor open before the ids land is labelled once they do',
    late && late.textContent, 'e26440ac78ed42b4af7426de94e48c18');

  // A zone page that will not answer is a page with no ids on it, not a broken
  // one, and the reason has to reach the console.
  const refused = await boot({
    embedded: ELSEWHERE,
    respond: async () => ({ ok: false, status: 503, text: async () => '' }),
  });
  check('a refused fetch prints no ids', JSON.stringify(refused.ids()), '[null,null,null,null]');
  check('a refused fetch says why', refused.warnings.join('\n'),
    '[firewall-rule-ids] no rule ids for this zone. the zone page responded 503');

  process.exit(failures === 0 ? 0 : 1);
})();
