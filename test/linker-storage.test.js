// Storage and migration tests for laravel-cloud-nightwatch-linker.
//
//   node test/linker-storage.test.js      (or bin/test.sh to run every test)
//
// No dependencies and no test framework, matching the rest of the repo. The
// migration lives inside the script's IIFE, so it is reached the way a browser
// reaches it: the file is evaluated against a DOM stub real enough that the Cloud
// and Nightwatch entry points run as far as touching storage. A stub too thin
// makes every assertion pass vacuously, which is the trap this file exists to
// avoid -- each case below changes storage in a way a wrong implementation cannot.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/laravel-cloud-nightwatch-linker.user.js', 'utf8');

function el(props = {}) {
  const node = {
    style: {}, dataset: {}, children: [], childNodes: [],
    classList: { add() {}, remove() {} },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    removeChild() {}, remove() {}, setAttribute() {}, getAttribute: () => null,
    addEventListener() {}, removeAttribute() {}, cloneNode() { return el(); },
    querySelector: () => null, querySelectorAll: () => [],
    closest: () => null, textContent: '', innerHTML: '',
  };
  return Object.assign(node, props);
}

function span(text) { return el({ textContent: text }); }

// The Nightwatch sidebar: an <aside> holding the app/env combobox and a nav link.
function nightwatchDom() {
  const combobox = el({ textContent: 'shop\nproduction' });
  combobox.querySelectorAll = sel => (sel === 'span' ? [span('shop'), span('production')] : []);
  const navLink = el();
  const aside = el();
  navLink.parentElement = aside;
  aside.querySelector = sel => {
    if (sel.includes('combobox') || sel.includes('button')) return combobox;
    if (sel.includes('a[href') || sel === 'a') return navLink;
    return null;
  };
  return { aside, combobox };
}

function run(initialStore, hostname, pathname) {
  let store = JSON.stringify(initialStore);
  let bootFn = null;
  const { aside, combobox } = nightwatchDom();

  const document = {
    documentElement: el(),
    head: el(),
    body: el(),
    getElementById: () => null,
    createElement: () => el(),
    createElementNS: () => el(),
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector(sel) {
      if (hostname !== 'nightwatch.laravel.com') return null;
      if (sel === 'aside') return aside;
      if (sel.includes('combobox') || sel.includes('aside button')) return combobox;
      return null;
    },
  };

  const sandbox = {
    GM_getValue: (k, d) => (store === undefined ? d : store),
    GM_setValue: (k, v) => { store = v; },
    console: { warn() {}, error() {}, log() {} },
    setTimeout: fn => { bootFn = fn; },
    MutationObserver: class { observe() {} },
    Image: class { set src(_) {} },
    document,
    prompt: () => null,
    window: { location: { hostname, pathname }, addEventListener() {} },
  };
  sandbox.window.document = document;
  sandbox.location = sandbox.window.location;
  sandbox.location.reload = () => {};

  vm.runInContext(src, vm.createContext(sandbox));
  if (bootFn) bootFn();
  return JSON.parse(store);
}

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`      expected ${e}\n      actual   ${a}`);
}

const CLOUD = 'cloud.laravel.com', NW = 'nightwatch.laravel.com';

// --- migration, driven from the Cloud side (recordCloudPath touches storage) ---
check('legacy key with cloudPath re-keys to org:app:env',
  run({ 'shop:production': { uuid: 'u-1', region: 'us', cloudPath: 'acme/shop/production' } },
      CLOUD, '/acme/shop/production'),
  { 'acme:shop:production': { uuid: 'u-1', region: 'us', cloudPath: 'acme/shop/production' } });

check('legacy string value normalises to an object',
  run({ 'shop:production': 'u-9' }, CLOUD, '/acme/shop/production'),
  { 'acme:shop:production': { uuid: 'u-9', region: 'us', cloudPath: 'acme/shop/production' } });

check('legacy key without cloudPath is adopted by the org visiting it',
  run({ 'shop:production': { uuid: 'u-3', region: 'us' } }, CLOUD, '/acme/shop/production'),
  { 'acme:shop:production': { uuid: 'u-3', region: 'us', cloudPath: 'acme/shop/production' } });

// --- the collision Codex found ---
check('two orgs sharing app+env names both survive a Cloud visit',
  run({ 'acme:shop:production':   { uuid: 'u-1', region: 'us', cloudPath: 'acme/shop/production' },
        'globex:shop:production': { uuid: 'u-2', region: 'eu', cloudPath: 'globex/shop/production' } },
      CLOUD, '/globex/shop/production'),
  { 'acme:shop:production':   { uuid: 'u-1', region: 'us', cloudPath: 'acme/shop/production' },
    'globex:shop:production': { uuid: 'u-2', region: 'eu', cloudPath: 'globex/shop/production' } });

// --- Nightwatch side now keys on the UUID ---
// parseNightwatchUrl only accepts a uuid longer than 10 chars, so these use
// realistic ids: a short stand-in would be rejected and the test would pass vacuously.
const UUID_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const UUID_X = 'ffffffff-9999-8888-7777-666666666666';

check('region drift is corrected on the uuid-matched entry',
  run({ 'acme:shop:production': { uuid: UUID_A, region: 'us', cloudPath: 'acme/shop/production' } },
      NW, '/eu/environments/' + UUID_A + '/dashboard'),
  { 'acme:shop:production': { uuid: UUID_A, region: 'eu', cloudPath: 'acme/shop/production' } });

check('an unknown uuid never hijacks a same-named entry from another org',
  run({ 'acme:shop:production': { uuid: UUID_A, region: 'us', cloudPath: 'acme/shop/production' } },
      NW, '/us/environments/' + UUID_X + '/dashboard'),
  { 'acme:shop:production': { uuid: UUID_A, region: 'us', cloudPath: 'acme/shop/production' } });

console.log(failures ? `\n${failures} failure(s)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
