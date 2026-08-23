// Clipboard text and freshness tests for laravel-cloud-copy-deployment-logs.
//
//   node test/copy-deployment-logs.test.js      (or bin/test.sh to run every test)
//
// No dependencies and no test framework, matching the rest of the repo. The
// formatting lives inside the script's IIFE, so it is reached the way a browser
// reaches it: the file is evaluated against a DOM stub real enough that apply()
// finds sections, attaches controls, and runs a control's click handler all the
// way to a clipboard write. A stub too thin makes every assertion pass
// vacuously, so each case below asserts on text a wrong implementation cannot
// produce.
//
// The payloads are hand-built from the shapes cloud.laravel.com actually sends,
// noted beside each fixture. Real deployment logs are not committed here.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('scripts/laravel-cloud-copy-deployment-logs.user.js', 'utf8');

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`);
}
function checkIncludes(name, haystack, needle) {
  const ok = typeof haystack === 'string' && haystack.includes(needle);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) console.log(`     missing:  ${JSON.stringify(needle)}\n     in:       ${JSON.stringify(haystack)}`);
}

// --- fixtures ---------------------------------------------------------------

// A finished deployment. Note that a step's only sub-step repeats its parent's
// description verbatim, and that a deployment status is namespaced.
const finished = {
  deployment: { slug: '11', short_commit_hash: '50569ee', status: 'deployment.succeeded', failure_reason: null },
  deploymentSteps: {
    build_logs: { description: 'Build logs' },
    deployment_logs: { description: 'Deployment logs' },
  },
  deploymentBuildSteps: [
    {
      description: 'Preparing build environment', status: 'finished', duration: 2938,
      subSteps: [
        { description: 'Cloning application source control repository', status: 'finished', duration: 1200, time: '00:00:14' },
        { description: 'Creating build environment', status: 'finished', duration: 1738, time: '00:00:15' },
      ],
    },
    {
      description: 'Running build commands', status: 'finished', duration: 13623,
      subSteps: [
        { description: 'Running build commands', status: 'finished', duration: 13623, time: '00:00:16', output: '$ Running build command\ncomposer install\n' },
      ],
    },
  ],
  deploymentDeploySteps: [
    {
      description: 'Running deploy commands', status: 'skipped',
      subSteps: [{ description: 'Running deploy commands', status: 'skipped', output: 'No deploy command configured' }],
    },
  ],
  deploymentFailureReason: null,
  cachedDiagnosis: null,
  buildLogsUnavailable: false,
  deployLogsUnavailable: false,
};

// A failed deployment. Every step is cancelled with no duration, no time and no
// output, the banner text arrives as a { title, description } pair, and the
// technical cause sits on the deployment itself where the page never shows it.
const failed = {
  deployment: {
    slug: '2', short_commit_hash: '0f977b3', status: 'build.failed',
    failure_reason: '[buildkit_build] buildkit build failed: builder exceeded maximum connection attempts',
  },
  deploymentSteps: { build_logs: { description: 'Build logs' }, deployment_logs: { description: 'Deployment logs' } },
  deploymentBuildSteps: [
    { description: 'Running build commands', status: 'cancelled', subSteps: [{ description: 'Running build commands', status: 'cancelled' }] },
  ],
  deploymentDeploySteps: [
    { description: 'Updating environment stack', status: 'cancelled', subSteps: [{ description: 'Updating environment stack', status: 'cancelled' }] },
  ],
  deploymentFailureReason: {
    title: 'Build failed',
    description: 'The build has failed unexpectedly, and we were unable to determine the cause.',
  },
  cachedDiagnosis: null,
  buildLogsUnavailable: true,
  deployLogsUnavailable: true,
};

// A deployment still building. The status is namespaced on the phase that is
// running, a running or pending step carries no duration at all, and a pending
// step has no timestamp either.
const building = {
  deployment: { slug: '12', short_commit_hash: '50569ee', status: 'build.running', failure_reason: null },
  deploymentSteps: {
    build_logs: { progress: 'running', description: 'Build logs' },
    deployment_logs: { progress: 'pending', description: 'Deployment logs' },
  },
  deploymentBuildSteps: [
    {
      description: 'Running build commands', status: 'running',
      subSteps: [{ description: 'Running build commands', status: 'running', time: '00:00:10', output: '$ Running build command\ncomposer install' }],
    },
    {
      description: 'Pushing application', status: 'pending',
      subSteps: [
        { description: 'Cleaning up environment', status: 'pending' },
        { description: 'Uploading application', status: 'pending' },
      ],
    },
  ],
  deploymentDeploySteps: [
    { description: 'Preparing deploy environment', status: 'pending', subSteps: [{ description: 'Preparing deploy environment', status: 'pending' }] },
  ],
  deploymentFailureReason: null,
  cachedDiagnosis: null,
  buildLogsUnavailable: false,
  deployLogsUnavailable: false,
};

// --- DOM stub ---------------------------------------------------------------

const CHEVRON_CLASS = 'flex size-5 shrink-0 items-center justify-center text-icon-alpha sm:size-8';
const SVG_CLASS = 'shrink-0 fill-none stroke-current stroke-[1.8] size-5 -rotate-90 transition group-data-open/inner:rotate-0';

function el(props = {}) {
  const node = {
    children: [], attributes: {}, title: '', tag: null, parentElement: null,
    classList: { add() {}, remove() {} },
    append(child) { child.parentElement = this; this.children.push(child); return child; },
    appendChild(child) { return this.append(child); },
    // A real remove() is what lets the script empty an svg before redrawing it.
    remove() {
      const siblings = this.parentElement ? this.parentElement.children : null;
      if (siblings) siblings.splice(siblings.indexOf(this), 1);
      this.parentElement = null;
    },
    removeAttribute(name) { delete this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; },
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    querySelector(selector) { return this.children.find(child => child.tag === selector) || null; },
    querySelectorAll: () => [],
    closest: () => null,
    cloneNode() { return el({ tag: this.tag, attributes: Object.assign({}, this.attributes) }); },
    get firstChild() { return this.children[0] || null; },
    get lastElementChild() { return this.children[this.children.length - 1] || null; },
    textContent: '',
  };
  return Object.assign(node, props);
}

/** A step row: the header button, its title, its meta cell and its chevron. */
function stepRow(description, visibleLog, glyphless) {
  const chevronSvg = el({ tag: 'svg', attributes: { class: SVG_CLASS } });
  const chevron = el({ attributes: { class: CHEVRON_CLASS } });
  chevron.querySelector = selector => (selector === 'svg' && !glyphless ? chevronSvg : null);

  const title = el({ textContent: `\n  ${description}\n` });
  const meta = el();
  meta.querySelector = selector => (selector.includes('data-fg-copy-log')
    ? meta.children.find(child => child.getAttribute('data-fg-copy-log')) || null
    : null);

  const header = el({ children: [title, meta] });
  header.querySelector = selector => {
    if (selector === ':scope > p') return title;
    if (selector.includes('size-5')) return chevron;
    return null;
  };

  // The page renders a log body only while the step is expanded.
  const rows = (visibleLog || []).map(cells => el({ children: cells.map(text => el({ textContent: text })) }));
  const body = rows.length ? el() : null;
  if (body) body.querySelectorAll = () => rows;
  header.parentElement = el();
  header.parentElement.querySelector = () => body;

  return { header, meta, title };
}

function makeDocument(sections) {
  const headers = [];
  const rows = [];

  for (const section of sections) {
    const sectionRows = section.steps.map(step => stepRow(step.description, step.visibleLog, section.glyphless));
    rows.push(...sectionRows);

    const strong = el({ textContent: section.title });
    const sectionMeta = el();
    sectionMeta.querySelector = selector => (selector.includes('data-fg-copy-log')
      ? sectionMeta.children.find(child => child.getAttribute('data-fg-copy-log')) || null
      : null);

    const header = el({ children: [el(), sectionMeta] });
    header.querySelector = selector => (selector === 'strong' ? strong : null);
    header.parentElement = el();
    header.parentElement.querySelectorAll = () => sectionRows.map(row => row.header);
    header.parentElement.querySelector = () => sectionRows[0].header;
    headers.push(header);
  }

  const document = {
    documentElement: el(),
    addEventListener() {},
    createElementNS: (namespace, tag) => el({ tag }),
    querySelector: () => null,
    querySelectorAll: selector => (selector.includes('sticky') ? headers : []),
  };
  return { document, headers, rows };
}

/**
 * Boots the script against a stubbed page, then returns a handle that clicks a
 * copy control and resolves with whatever reached the clipboard.
 */
async function boot({ sections, path, respond }) {
  const { document, headers, rows } = makeDocument(sections);
  const warnings = [];
  const observed = [];
  let write = Promise.resolve();

  const context = {
    document,
    console: { warn: (...args) => warnings.push(args.join(' ')), error: (...args) => warnings.push(args.join(' ')) },
    location: { pathname: path, href: `https://cloud.laravel.com${path}` },
    navigator: {
      clipboard: {
        write(items) {
          write = items[0].parts['text/plain'].then(blob => blob.text());
          return write;
        },
      },
    },
    fetch: respond,
    Blob,
    DOMParser: class {
      parseFromString(html) {
        const node = el({ textContent: html });
        return { querySelectorAll: selector => (selector.includes('application/json') ? [node] : []) };
      }
    },
    MutationObserver: class {
      constructor(callback) { observed.push(callback); }
      observe() {}
    },
    setTimeout, clearTimeout,
  };
  context.addEventListener = () => {};
  context.window = context;
  context.window.ClipboardItem = class { constructor(parts) { this.parts = parts; } };

  vm.createContext(context);
  vm.runInContext(src, context);
  // apply() runs behind the script's own 50 ms debounce.
  await new Promise(resolve => setTimeout(resolve, 80));

  function control(label) {
    const all = headers.map(header => header.lastElementChild)
      .concat(rows.map(row => row.meta))
      .flatMap(meta => meta.children);
    const found = all.find(node => node.getAttribute('aria-label') === label);
    if (!found) throw new Error(`no control labelled "${label}" among [${all.map(n => n.getAttribute('aria-label')).join(' | ')}]`);
    return found;
  }

  return {
    warnings,
    context,
    /** Fires the script's own MutationObserver, the way a re-render would. */
    async rerun() {
      for (const callback of observed) callback([]);
      await new Promise(resolve => setTimeout(resolve, 80));
    },
    labels: () => headers.map(header => header.lastElementChild).concat(rows.map(row => row.meta))
      .flatMap(meta => meta.children).map(node => node.getAttribute('aria-label')),
    async copy(label) {
      const node = control(label);
      for (const handler of node.listeners.click) handler({ preventDefault() {}, stopPropagation() {} });
      return write;
    },
    control,
  };
}

/** The page is fetched as HTML, and the payload is a JSON script inside it. */
function responder(props) {
  return async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ component: 'Deployments/Show', props }) });
}

const PATH = '/fgilio/accountpal/production/deployments/11/50569ee';
const FINISHED_SECTIONS = [
  { title: 'Build logs', steps: [{ description: 'Preparing build environment' }, { description: 'Running build commands' }] },
  { title: 'Deployment logs', steps: [{ description: 'Running deploy commands' }] },
];

// --- cases ------------------------------------------------------------------

(async () => {
  // Every step and every section gets exactly one control, and nothing else does.
  const page = await boot({ sections: FINISHED_SECTIONS, path: PATH, respond: responder(finished) });
  check('a control per section and per step', page.labels().join(' | '),
    'Copy all Build logs | Copy all Deployment logs | ' +
    'Copy the Preparing build environment log | Copy the Running build commands log | ' +
    'Copy the Running deploy commands log');

  check('a step whose sub-steps are named separately lists each one',
    await page.copy('Copy the Preparing build environment log'),
    'fgilio / accountpal / production / deployment 11 / 50569ee (deployment succeeded)\n' +
    '\n' +
    '## Preparing build environment (finished, 2.9s)\n' +
    '\n' +
    '00:00:14 Cloning application source control repository (finished, 1.2s)\n' +
    '\n' +
    '00:00:15 Creating build environment (finished, 1.7s)');

  check('a sub-step that repeats its parent name contributes only its output',
    await page.copy('Copy the Running build commands log'),
    'fgilio / accountpal / production / deployment 11 / 50569ee (deployment succeeded)\n' +
    '\n' +
    '## Running build commands (finished, 13.6s)\n' +
    '\n' +
    '$ Running build command\ncomposer install');

  check('a skipped step keeps its status and loses its duration',
    await page.copy('Copy the Running deploy commands log'),
    'fgilio / accountpal / production / deployment 11 / 50569ee (deployment succeeded)\n' +
    '\n' +
    '## Running deploy commands (skipped)\n' +
    '\n' +
    'No deploy command configured');

  const section = await page.copy('Copy all Build logs');
  checkIncludes('a section copy titles itself', section, '# Build logs\n');
  checkIncludes('a section copy carries its first step', section, '## Preparing build environment (finished, 2.9s)');
  checkIncludes('a section copy carries its last step', section, '## Running build commands (finished, 13.6s)');
  check('a section copy does not reach into the other section', section.includes('Running deploy commands'), false);

  // A failure is where this script earns its keep, so all three accounts of one
  // have to survive into the clipboard, and cancelled steps must not pad it.
  const broken = await boot({
    sections: [{ title: 'Build logs', steps: [{ description: 'Running build commands' }] },
               { title: 'Deployment logs', steps: [{ description: 'Updating environment stack' }] }],
    path: '/fgilio/accountpal/production/deployments/2/0f977b3',
    respond: responder(failed),
  });
  check('a failed deployment reports status, banner and technical cause',
    await broken.copy('Copy all Build logs'),
    'fgilio / accountpal / production / deployment 2 / 0f977b3 (build failed)\n' +
    'Failure: Build failed. The build has failed unexpectedly, and we were unable to determine the cause.\n' +
    'Cause: [buildkit_build] buildkit build failed: builder exceeded maximum connection attempts\n' +
    '\n' +
    '# Build logs\n' +
    '\n' +
    'These logs are no longer available, so the steps below carry no output.\n' +
    '\n' +
    '## Running build commands (cancelled)');

  // A deployment that is still building has to copy cleanly too: it is the case
  // you most want to hand to an agent, and every duration is missing.
  const running = await boot({
    sections: [{ title: 'Build logs', steps: [{ description: 'Running build commands' }, { description: 'Pushing application' }] },
               { title: 'Deployment logs', steps: [{ description: 'Preparing deploy environment' }] }],
    path: '/fgilio/accountpal/production/deployments/12/50569ee',
    respond: responder(building),
  });
  check('a build in progress copies with no durations at all',
    await running.copy('Copy all Build logs'),
    'fgilio / accountpal / production / deployment 12 / 50569ee (build running)\n' +
    '\n' +
    '# Build logs\n' +
    '\n' +
    '## Running build commands (running)\n' +
    '\n' +
    '$ Running build command\ncomposer install\n' +
    '\n' +
    '## Pushing application (pending)\n' +
    '\n' +
    'Cleaning up environment (pending)\n' +
    '\n' +
    'Uploading application (pending)');

  check('a step that has not started yet copies its heading alone',
    await running.copy('Copy the Preparing deploy environment log'),
    'fgilio / accountpal / production / deployment 12 / 50569ee (build running)\n' +
    '\n' +
    '## Preparing deploy environment (pending)');

  // Nothing stops you navigating while the fetch is in flight. The response still
  // describes the deployment you clicked on, so the heading has to as well.
  const wandering = await boot({
    sections: FINISHED_SECTIONS,
    path: PATH,
    respond: async () => {
      wandering.context.location.pathname = '/fgilio/accountpal/production/deployments/9/45d296e';
      wandering.context.location.href = 'https://cloud.laravel.com' + wandering.context.location.pathname;
      return { ok: true, status: 200, text: async () => JSON.stringify({ props: finished }) };
    },
  });
  checkIncludes('a navigation mid-fetch does not retitle the log',
    await wandering.copy('Copy the Running build commands log'),
    'deployment 11 / 50569ee (deployment succeeded)');

  // And it must not throw when the new address is not a deployment at all.
  const wanderedOff = await boot({
    sections: FINISHED_SECTIONS,
    path: PATH,
    respond: async () => {
      wanderedOff.context.location.pathname = '/fgilio/accountpal/production/deployments';
      return { ok: true, status: 200, text: async () => JSON.stringify({ props: finished }) };
    },
  });
  checkIncludes('leaving the deployment pages mid-fetch still copies',
    await wanderedOff.copy('Copy the Running build commands log'),
    '## Running build commands (finished, 13.6s)');

  // A section is paired with the payload by position, so a title that disagrees
  // means the pairing is wrong and the clipboard would get the other section.
  const mislabelled = await boot({
    sections: [{ title: 'Deployment logs', steps: [{ description: 'Running build commands' }] }],
    path: PATH,
    respond: responder(finished),
  });
  let wrongSection = null;
  await mislabelled.copy('Copy all Deployment logs').catch(error => { wrongSection = error.message; });
  check('a section the payload names differently is refused', wrongSection,
    'section 0 is "Build logs" in the payload and "Deployment logs" on the page');

  let wrongSectionStep = null;
  await mislabelled.copy('Copy the Running build commands log').catch(error => { wrongSectionStep = error.message; });
  check('a step copy checks its section too', wrongSectionStep,
    'section 0 is "Build logs" in the payload and "Deployment logs" on the page');

  // The chevron wrapper is the clone template and the glyph inside it is the
  // icon. Losing the glyph must warn by name, not throw on every mutation tick.
  const glyphless = await boot({
    sections: [{ title: 'Build logs', steps: [{ description: 'Running build commands' }], glyphless: true }],
    path: PATH,
    respond: responder(finished),
  });
  check('a chevron with no glyph attaches nothing', glyphless.labels().length, 0);
  checkIncludes('and says which selector missed', glyphless.warnings.join('\n'),
    'the glyph inside the disclosure chevron not found (selector "svg")');

  // The page ships a payload for whichever deployment was opened directly, and
  // leaves it in place through every later Inertia visit. Copying it would hand
  // over another deployment's logs, so a payload that disagrees with the address
  // bar is refused outright.
  const stale = await boot({ sections: FINISHED_SECTIONS, path: PATH, respond: responder(failed) });
  let refused = null;
  await stale.copy('Copy the Running build commands log').catch(error => { refused = error.message; });
  check('a payload for another deployment is refused', refused,
    'the payload describes deployment 2/0f977b3, not 11/50569ee');

  // With the payload unusable, an expanded step still copies what is on screen.
  const offline = await boot({
    sections: [{
      title: 'Build logs',
      steps: [{ description: 'Running build commands', visibleLog: [['00:00:16', 'Running build commands'], ['$ composer install\nNothing to install']] }],
    }],
    path: PATH,
    respond: async () => ({ ok: false, status: 503, text: async () => '' }),
  });
  check('an unreachable payload falls back to the expanded log',
    await offline.copy('Copy the Running build commands log'),
    '## Running build commands\n\n00:00:16 Running build commands\n$ composer install\nNothing to install');
  checkIncludes('the fallback says why it happened', offline.warnings.join('\n'),
    'the deployment page responded 503. Copied the expanded log from the page instead.');

  // A collapsed step has no log on the page, so there is nothing to fall back to
  // and the failure has to surface rather than copying an empty string.
  const empty = await boot({
    sections: [{ title: 'Build logs', steps: [{ description: 'Running build commands' }] }],
    path: PATH,
    respond: async () => ({ ok: false, status: 503, text: async () => '' }),
  });
  let surfaced = null;
  await empty.copy('Copy the Running build commands log').catch(error => { surfaced = error.message; });
  check('a collapsed step with no payload reports the failure', surfaced, 'the deployment page responded 503');

  // A page whose step order has drifted from the payload must not copy the wrong
  // step under the right heading.
  const drifted = await boot({
    sections: [{ title: 'Build logs', steps: [{ description: 'Pushing application' }] }],
    path: PATH,
    respond: responder(finished),
  });
  let mismatch = null;
  await drifted.copy('Copy the Pushing application log').catch(error => { mismatch = error.message; });
  check('a step the payload does not name is refused', mismatch,
    'step 0 of section 0 is "Preparing build environment" in the payload and "Pushing application" on the page');

  // Running twice must not double the controls.
  const twice = await boot({ sections: FINISHED_SECTIONS, path: PATH, respond: responder(finished) });
  const before = twice.labels().join(' | ');
  await twice.rerun();
  await twice.rerun();
  check('re-running attaches nothing new', twice.labels().join(' | '), before);

  console.log(failures === 0 ? '\nAll cases passed.' : `\n${failures} case(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})();
