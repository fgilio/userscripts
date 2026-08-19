// snippets/gm-store.js — one JSON blob under one GM key, with schema migration.
//
// Needs @grant GM_getValue and @grant GM_setValue.
// Everything a script persists lives in a single object so a schema change is
// one migration function, not N key renames.

const STORE_KEY = 'script-name-store';
const SCHEMA = 2;

// Parsed once, then held. load() is called from apply(), which runs on every
// DOM mutation — re-parsing the whole blob there costs more the more you store.
let store = null;

function load() {
  if (store) return store;
  let raw;
  try { raw = JSON.parse(GM_getValue(STORE_KEY, '{}')); } catch { raw = {}; }
  if (!raw || typeof raw !== 'object') raw = {};
  store = migrate(raw);
  return store;
}

function save(data) {
  data.__schema = SCHEMA;
  store = data;
  GM_setValue(STORE_KEY, JSON.stringify(data));
}

// Old data outlives the code that wrote it. Migrate in place, then persist.
function migrate(data) {
  if (data.__schema === SCHEMA) return data;
  // v1 stored bare strings; v2 stores objects.
  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'string') data[key] = { value: data[key] };
  }
  save(data);   // save() stamps __schema
  return data;
}

// Time-boxed cache entry: return the stale value immediately, refresh behind it.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const inFlight = new Set();

function cached(key, fetcher, onReady) {
  const store = load();
  const hit = store[key];
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value;

  if (!inFlight.has(key)) {
    inFlight.add(key);
    Promise.resolve(fetcher())
      .then((value) => {
        if (value == null) return;
        const next = load();
        next[key] = { value, ts: Date.now() };
        save(next);
      })
      .catch((error) => console.error('[store]', error))
      .finally(() => { inFlight.delete(key); onReady?.(); });
  }
  return hit?.value ?? null;
}
