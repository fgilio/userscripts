// Tests for github-notifications-mark-all-done.
//
//   node test/notifications-mark-all.test.js      (or bin/test.sh to run every test)
//
// No dependencies and no test framework, matching the rest of the repo. The script
// is evaluated against a DOM stub real enough that apply() finds groups, clones the
// native button, and a click fetches the "View all" page and submits a form. The
// assertions sit on what would reach GitHub: the action and the posted fields. A
// wrong query there marks the wrong notifications, so that is where the cases bite.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/github-notifications-mark-all-done.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}

const settle = () => new Promise(resolve => setTimeout(resolve, 80));

// --- DOM stub ---------------------------------------------------------------

function text(value) {
  return { nodeType: 3, textContent: value };
}

/**
 * Selectors are matched the only ways the script writes them: a tag with an
 * optional class, `tag[name="x"]`, `tag[type="x"]`, `tag[attr]`, and `form[data-fg-mark-all]`.
 */
function matches(node, selector) {
  if (node.nodeType !== 1) return false;
  const m = selector.match(/^(\.?[\w-]+)?(?:\.([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/);
  if (!m) throw new Error(`the stub cannot match "${selector}"`);
  const [, head, cls, attr, value] = m;
  if (head && head.startsWith('.')) { if (!node.classList().includes(head.slice(1))) return false; }
  else if (head && node.tag !== head) return false;
  if (cls && !node.classList().includes(cls)) return false;
  if (attr) {
    const actual = attr in node ? node[attr] : node.getAttribute(attr);
    if (actual === null || actual === undefined) return false;
    if (value !== undefined && String(actual) !== value) return false;
  }
  return true;
}

function el(tag, props = {}, children = []) {
  const node = {
    nodeType: 1, tag, className: '', attributes: {}, dataset: {}, listeners: {},
    childNodes: [], parentElement: null,
    classList() { return this.className.split(/\s+/).filter(Boolean); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) {
      if (name === 'data-fg-mark-all') return this.dataset.fgMarkAll ?? null;
      return name in this.attributes ? this.attributes[name] : null;
    },
    append(...items) {
      for (const item of items) {
        const child = typeof item === 'string' ? text(item) : item;
        child.parentElement = this;
        this.childNodes.push(child);
      }
    },
    after(sibling) {
      const list = this.parentElement.childNodes;
      sibling.parentElement = this.parentElement;
      list.splice(list.indexOf(this) + 1, 0, sibling);
    },
    get textContent() { return this.childNodes.map(c => c.textContent).join(''); },
    querySelectorAll(selector) {
      const found = [];
      const walk = n => n.childNodes.forEach(c => { if (matches(c, selector)) found.push(c); if (c.nodeType === 1) walk(c); });
      walk(this);
      return found;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    cloneNode() {
      const copy = el(this.tag, { className: this.className, attributes: { ...this.attributes } });
      copy.append(...this.childNodes.map(c => (c.nodeType === 3 ? text(c.textContent) : c.cloneNode(true))));
      return copy;
    },
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); },
  };
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function input(name, value) {
  return el('input', { type: 'hidden', name, value });
}

/** One repo group as github.com/notifications renders it, grouped by repository. */
function group(repo, { visible, total }) {
  const ids = Array.from({ length: visible }, (_, i) => input('notification_ids[]', `NT_${repo}_${i}`));
  const button = el('button', { type: 'submit', className: 'btn btn-sm' }, [el('span', {}, [el('svg')]), '\n  Mark as done\n']);
  const native = el('form', {
    className: 'd-none d-md-block js-grouped-notifications-mark-all-read-button',
    attributes: { action: '/notifications/beta/archive', method: 'post' },
  }, [input('authenticity_token', 'GROUP_TOKEN'), ...ids, button]);
  const header = el('div', { className: 'Box-header' }, [el('h3', {}, [repo]), native]);

  const children = [header];
  if (total > visible) {
    const href = `/notifications?query=repo%3A${encodeURIComponent(repo)}`;
    children.push(el('a', { attributes: { href }, href: `https://github.com${href}` }, [`View all ${total} notifications`]));
  }
  return el('div', { className: 'Box js-notifications-group' }, children);
}

/** The "View all" page: the per-row archive forms, plus GitHub's own select-all form. */
function viewAllPage(query, { token = 'PAGE_TOKEN', decoy = true } = {}) {
  const root = el('html');
  root.append(el('form', { attributes: { action: '/notifications/beta/archive' } }, [input('authenticity_token', 'ROW'), input('notification_ids[]', 'NT_row')]));
  if (decoy) {
    root.append(el('form', { attributes: { action: '/notifications/beta/archive' } }, [
      input('authenticity_token', 'WIDE'), input('query', ''), input('mark_all', '1'),
    ]));
  }
  if (query !== null) {
    root.append(el('form', { attributes: { action: '/notifications/beta/archive' } }, [
      input('authenticity_token', token), input('query', query), input('mark_all', '1'),
    ]));
  }
  return root;
}

function boot({ path = '/notifications', groups, page = () => viewAllPage('repo:acme/app'), status = 200 }) {
  const warnings = [];
  const fetched = [];
  const submitted = [];
  const assigned = [];
  const observers = [];
  const root = el('body', {}, groups);

  const document = {
    documentElement: root,
    addEventListener() {},
    createElement: tag => {
      const node = el(tag);
      if (tag === 'form') {
        node.submit = function () {
          submitted.push({
            action: this.getAttribute('action'),
            fields: this.querySelectorAll('input').map(i => `${i.name}=${i.value}`),
          });
        };
      }
      return node;
    },
    querySelectorAll: selector => root.querySelectorAll(selector),
  };

  const context = {
    document,
    console: { warn: (...args) => warnings.push(args.join(' ')), error: (...args) => warnings.push(args.join(' ')) },
    location: { pathname: path, href: `https://github.com${path}`, assign: href => assigned.push(href) },
    URL,
    fetch(href) {
      fetched.push(href);
      return Promise.resolve({ ok: status === 200, status, text: () => Promise.resolve(href) });
    },
    DOMParser: class { parseFromString(href) { return page(href); } },
    MutationObserver: class { constructor(callback) { observers.push(callback); } observe() {} },
    setTimeout, clearTimeout,
  };
  context.addEventListener = () => {};
  context.window = context;

  vm.createContext(context);
  vm.runInContext(src, context);

  return {
    warnings, fetched, submitted, assigned,
    ours: () => root.querySelectorAll('form[data-fg-mark-all]'),
    async rerun() { observers.forEach(callback => callback([])); await settle(); },
    async click(form) {
      form.listeners.submit.forEach(callback => callback({ preventDefault() {} }));
      await settle();
    },
  };
}

// --- cases ------------------------------------------------------------------

(async () => {
  {
    const run = boot({ groups: [group('acme/app', { visible: 2, total: 3 }), group('acme/lib', { visible: 1, total: 1 })] });
    await settle();
    const ours = run.ours();
    check('adds one button, only to the group that hides notifications', ours.length, 1);
    check('the button names the full count', ours[0].querySelector('button').textContent.trim(), 'Mark all 3 as done');
    check('the button keeps the native icon', ours[0].querySelector('button').querySelectorAll('svg').length, 1);
    check('it sits right after the native form', ours[0].parentElement.childNodes.indexOf(ours[0]) - 1,
      ours[0].parentElement.childNodes.indexOf(ours[0].parentElement.querySelector('form.js-grouped-notifications-mark-all-read-button')));
    check('the injected form is not the native one', ours[0].classList().includes('js-grouped-notifications-mark-all-read-button'), false);

    await run.rerun();
    await run.rerun();
    check('idempotent across re-runs', run.ours().length, 1);

    await run.click(ours[0]);
    check('fetches the group\'s "View all" page', run.fetched, ['https://github.com/notifications?query=repo%3Aacme%2Fapp']);
    check('posts GitHub\'s own select-all form for that query, not the wider decoy', run.submitted, [{
      action: '/notifications/beta/archive',
      fields: ['authenticity_token=PAGE_TOKEN', 'query=repo:acme/app', 'mark_all=1'],
    }]);
    check('no fallback navigation on success', run.assigned, []);

    await run.click(ours[0]);
    check('a second click while submitting does nothing', run.fetched.length, 1);
  }

  {
    const run = boot({ groups: [group('acme/app', { visible: 2, total: 5 })], page: () => viewAllPage(null) });
    await settle();
    await run.click(run.ours()[0]);
    check('without a matching select-all form, nothing is posted', run.submitted, []);
    check('the wider query:"" form is never taken as a match', run.submitted.length, 0);
    check('falls back to opening the full list', run.assigned, ['https://github.com/notifications?query=repo%3Aacme%2Fapp']);
    check('and says why', run.warnings.some(w => w.includes('mark_all=1') && w.includes('repo:acme/app')), true);
  }

  {
    const run = boot({ groups: [group('acme/app', { visible: 2, total: 5 })], page: () => viewAllPage('repo:acme/app', { token: '' }) });
    await settle();
    await run.click(run.ours()[0]);
    check('a select-all form with an empty token is not trusted', run.submitted, []);
  }

  {
    const run = boot({ groups: [group('acme/app', { visible: 2, total: 5 })], status: 500 });
    await settle();
    await run.click(run.ours()[0]);
    check('a failed fetch posts nothing and opens the list', [run.submitted.length, run.assigned.length], [0, 1]);
    check('and names the status', run.warnings.some(w => w.includes('500')), true);
  }

  {
    const run = boot({ path: '/notifications/beta/archive', groups: [group('acme/app', { visible: 2, total: 3 })] });
    await settle();
    check('idle off the inbox route', run.ours().length, 0);
  }

  {
    const run = boot({ groups: [] });
    await settle();
    check('an empty inbox stays silent', run.warnings, []);
  }

  {
    const broken = group('acme/app', { visible: 2, total: 3 });
    const header = broken.childNodes[0];
    header.childNodes = header.childNodes.filter(c => c.tag !== 'form');
    const run = boot({ groups: [broken, group('acme/lib', { visible: 2, total: 3 })] });
    await settle();
    await run.rerun();
    check('a group missing its native form is skipped', run.ours().length, 1);
    check('and warns once, naming the selector', run.warnings.filter(w => w.includes('js-grouped-notifications-mark-all-read-button')).length, 1);
  }

  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
