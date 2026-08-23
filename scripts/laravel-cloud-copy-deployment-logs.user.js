// ==UserScript==
// @name         Laravel Cloud Copy Deployment Logs
// @namespace    https://github.com/fgilio
// @version      1.1.0
// @description  Adds a copy button to every step and every section of a Laravel Cloud deployment, so a build or deploy log reaches the clipboard as plain text without expanding anything
// @author       Franco Gilio
// @match        https://cloud.laravel.com/*
// @icon         https://cloud.laravel.com/docs/_mintlify/favicons/cloud/CwnEEs8UQ8WD3Jou/_generated/favicon/apple-touch-icon.png
// @run-at       document-idle
// @noframes
// @downloadURL https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-copy-deployment-logs.user.js
// @updateURL   https://raw.githubusercontent.com/fgilio/userscripts/main/scripts/laravel-cloud-copy-deployment-logs.user.js
// @grant        none
// ==/UserScript==

// The @match is the whole host rather than the deployment path, because you reach a
// deployment by clicking a row in the list. That is an Inertia navigation, and
// Tampermonkey decides whether to inject at document load, so a path-scoped @match
// leaves the script absent on the one route it exists for. ROUTE below does the
// narrowing instead, and apply() is a no-op everywhere else.

(function () {
  'use strict';

  const TAG = '[cloud-copy-logs]';

  /** /{org}/{app}/{env}/deployments/{number}/{short commit hash} */
  const ROUTE = /^\/([^/]+)\/([^/]+)\/([^/]+)\/deployments\/([^/]+)\/([^/]+)\/?$/;

  const SEL = {
    // The Inertia page payload, a plain JSON script beside the app root. It
    // carries the complete log text of every step, expanded or not.
    payload: 'script[type="application/json"]',
    sectionHeader: 'div.sticky.justify-between',
    sectionTitle: 'strong',
    stepHeader: 'button.group\\/inner',
    stepTitle: ':scope > p',
    // The disclosure chevron, cloned as the template for every control here.
    chevron: 'span[class*="size-5"]',
    logBody: 'div.custom-scrollbar',
    logRow: 'div.flex.items-start',
  };

  const MARKER = 'data-fg-copy-log';

  // Stroke geometry, matching the chevron the controls are cloned from.
  const ICONS = {
    copy: [
      'M9 9V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H15',
      'M5.5 9h8A1.5 1.5 0 0 1 15 10.5v8A1.5 1.5 0 0 1 13.5 20h-8A1.5 1.5 0 0 1 4 18.5v-8A1.5 1.5 0 0 1 5.5 9Z',
    ],
    copied: ['M5 12.5L9.5 17L19 7.5'],
    failed: ['M7.5 7.5L16.5 16.5', 'M16.5 7.5L7.5 16.5'],
  };

  // Payload key -> section, in the order the page renders them.
  const SECTIONS = [
    { key: 'build_logs', steps: 'deploymentBuildSteps', unavailable: 'buildLogsUnavailable' },
    { key: 'deployment_logs', steps: 'deploymentDeploySteps', unavailable: 'deployLogsUnavailable' },
  ];

  const warned = new Set();
  function need(root, selector, what) {
    const el = root.querySelector(selector);
    if (el) { warned.delete(selector); return el; }
    if (!warned.has(selector)) {
      warned.add(selector);
      console.warn(`${TAG} ${what} not found (selector "${selector}"). Site markup changed. Update the selector in this script.`);
    }
    return null;
  }


  function readProps(doc) {
    for (const node of doc.querySelectorAll(SEL.payload)) {
      let page;
      try { page = JSON.parse(node.textContent); } catch (error) { continue; }
      if (page && page.props && page.props.deployment) return page.props;
    }
    return null;
  }

  /**
   * Fetches the payload for the deployment currently in the address bar.
   *
   * The copy in the page is written once, at first paint, so it describes
   * whichever deployment was opened directly. Every later visit is an Inertia
   * navigation that leaves it untouched, and a running deployment outgrows it
   * line by line. Reading it would hand an agent another build's logs.
   */
  async function freshProps() {
    const route = ROUTE.exec(location.pathname);
    if (!route) throw new Error('the address bar does not hold a deployment path');

    const response = await fetch(location.href, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });
    if (!response.ok) throw new Error(`the deployment page responded ${response.status}`);

    const props = readProps(new DOMParser().parseFromString(await response.text(), 'text/html'));
    if (!props) throw new Error(`no deployment payload in the response (selector "${SEL.payload}")`);

    const [, , , , slug, hash] = route;
    const deployment = props.deployment;
    if (String(deployment.slug) !== slug || String(deployment.short_commit_hash) !== hash) {
      throw new Error(`the payload describes deployment ${deployment.slug}/${deployment.short_commit_hash}, not ${slug}/${hash}`);
    }
    return props;
  }


  function formatDuration(ms) {
    if (typeof ms !== 'number') return null;
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  function annotate(status, ms) {
    // A deployment's own status is namespaced, "build.failed" or
    // "deployment.succeeded". Both halves are worth reading.
    const parts = [status && status.replace(/\./g, ' '), formatDuration(ms)].filter(Boolean);
    return parts.length ? ` (${parts.join(', ')})` : '';
  }

  /** Payload prose is either a string or a { title, description } pair. */
  function prose(value) {
    if (typeof value === 'string') return value.trim() || null;
    if (!value || typeof value !== 'object') return null;
    const parts = [value.title, value.description].filter(part => typeof part === 'string' && part.trim());
    return parts.length ? parts.join('. ') : null;
  }

  function provenance(props) {
    const [, org, app, env, slug, hash] = ROUTE.exec(location.pathname);
    const lines = [`${org} / ${app} / ${env} / deployment ${slug} / ${hash}${annotate(props.deployment.status)}`];

    // Three separate accounts of a failure, and only the first reaches the page.
    // failure_reason names the machinery that gave up.
    for (const [label, value] of [
      ['Failure', props.deploymentFailureReason],
      ['Cause', props.deployment.failure_reason],
      ['Diagnosis', props.cachedDiagnosis],
    ]) {
      const text = prose(value);
      if (text) lines.push(`${label}: ${text}`);
    }
    return lines;
  }

  function stepText(step) {
    const subSteps = step.subSteps || [];
    const lines = [`## ${step.description}${annotate(step.status, step.duration)}`];

    for (const sub of subSteps) {
      // A single sub-step usually repeats its parent's name verbatim. Printing
      // the heading twice would only pad the log an agent has to read.
      const echoesParent = subSteps.length === 1 && sub.description === step.description;
      const heading = echoesParent
        ? null
        : [sub.time, sub.description].filter(Boolean).join(' ') + annotate(sub.status, sub.duration);
      const output = sub.output ? sub.output.replace(/\s+$/, '') : null;
      if (!heading && !output) continue;

      lines.push('');
      if (heading) lines.push(heading);
      if (output) lines.push(output);
    }
    return lines.join('\n');
  }

  function sectionSteps(props, sectionIndex) {
    const section = SECTIONS[sectionIndex];
    if (!section) throw new Error(`the page renders ${sectionIndex + 1} log sections, the payload names ${SECTIONS.length}`);

    const steps = props[section.steps];
    if (!Array.isArray(steps)) throw new Error(`the payload has no "${section.steps}" array`);
    return steps;
  }

  function sectionTitle(props, sectionIndex, fallback) {
    const named = props.deploymentSteps && props.deploymentSteps[SECTIONS[sectionIndex].key];
    return (named && named.description) || fallback;
  }

  function composeStep(props, sectionIndex, stepIndex, expected) {
    const step = sectionSteps(props, sectionIndex)[stepIndex];
    if (!step) throw new Error(`the payload has no step ${stepIndex} in section ${sectionIndex}`);
    if (expected && step.description !== expected) {
      throw new Error(`step ${stepIndex} of section ${sectionIndex} is "${step.description}" in the payload and "${expected}" on the page`);
    }
    return provenance(props).concat('', stepText(step)).join('\n');
  }

  function composeSection(props, sectionIndex, fallbackTitle) {
    const blocks = [`# ${sectionTitle(props, sectionIndex, fallbackTitle)}`];
    if (props[SECTIONS[sectionIndex].unavailable]) {
      blocks.push('These logs are no longer available, so the steps below carry no output.');
    }
    for (const step of sectionSteps(props, sectionIndex)) blocks.push(stepText(step));
    return provenance(props).concat('', blocks.join('\n\n')).join('\n');
  }


  /**
   * The page renders a step's log only while it is expanded, so this covers
   * less ground than the payload. It is here so a payload the script no longer
   * understands degrades to copying what you can already see.
   */
  function visibleStepText(stepHeader) {
    const body = stepHeader.parentElement.querySelector(SEL.logBody);
    const rows = body ? [...body.querySelectorAll(SEL.logRow)] : [];
    if (!rows.length) return null;

    const title = stepHeader.querySelector(SEL.stepTitle);
    const heading = `## ${title ? title.textContent.trim() : 'Step'}`;
    // Each row is a timestamp cell beside a whitespace-pre cell that holds the
    // whole block, newlines included.
    const log = rows.map(row => [...row.children].map(cell => cell.textContent).join(' ')).join('\n');
    return `${heading}\n\n${log}`;
  }

  function withFallback(pending, fallback) {
    return pending.catch(error => {
      const text = fallback();
      if (!text) throw error;
      console.warn(`${TAG} ${error.message}. Copied the expanded log from the page instead.`);
      return text;
    });
  }


  const NS = 'http://www.w3.org/2000/svg';

  function pathNode(d) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    return path;
  }

  function glyph(template) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    // The chevron's own classes carry the stroke width, caps and sizing. Its
    // rotation is disclosure state and belongs to the chevron alone.
    svg.setAttribute('class', (template.getAttribute('class') || '')
      .split(/\s+/)
      .filter(name => !/rotate|group-data-open/.test(name))
      .join(' '));
    return svg;
  }

  /**
   * Clones the chevron's own span so the control inherits the icon colour, hit
   * area and responsive size the design system is currently rendering. Nothing
   * is added to it: Laravel Cloud ships no hover:text-* utility, so a hover
   * colour would be a class its stylesheet never generated.
   */
  function copyControl(chevron, label, compose) {
    const control = chevron.cloneNode(false);
    control.setAttribute(MARKER, '1');
    control.setAttribute('role', 'button');
    control.setAttribute('tabindex', '0');
    control.append(glyph(chevron.querySelector('svg')));

    let restore = 0;
    function show(paths, text) {
      const svg = control.querySelector('svg');
      while (svg.firstChild) svg.firstChild.remove();
      for (const d of paths) svg.append(pathNode(d));
      control.title = text;
      control.setAttribute('aria-label', text);
    }
    function settle(paths, text) {
      show(paths, text);
      clearTimeout(restore);
      restore = setTimeout(() => show(ICONS.copy, label), 1500);
    }

    function run(event) {
      // The step header is itself a button, and React listens at the document
      // root. Stopping here means the row never toggles on a copy.
      event.preventDefault();
      event.stopPropagation();
      write(compose()).then(
        () => settle(ICONS.copied, 'Copied'),
        error => { console.warn(TAG, error); settle(ICONS.failed, 'Copy failed, see the console'); }
      );
    }

    control.addEventListener('click', run);
    control.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') run(event);
    });

    show(ICONS.copy, label);
    return control;
  }

  /**
   * Hands the clipboard a promise rather than a string. The fetch outlives the
   * click's user activation on a slow connection, and writeText is refused once
   * that expires.
   */
  function write(pending) {
    const blob = pending.then(text => new Blob([text], { type: 'text/plain' }));
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      return navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
    }
    return blob.then(item => item.text()).then(text => navigator.clipboard.writeText(text));
  }


  function attach(meta, chevron, label, compose) {
    if (!meta || meta.querySelector(`[${MARKER}]`)) return;
    // Appended last on purpose: React owns this row's other children and
    // reconciles them by position, so a trailing node is the safe one to add.
    meta.append(copyControl(chevron, label, compose));
  }

  function apply() {
    if (!ROUTE.test(location.pathname)) return;

    const sections = [...document.querySelectorAll(SEL.sectionHeader)];
    if (!sections.length) {
      need(document, SEL.sectionHeader, 'the Build logs / Deployment logs section headers');
      return;
    }

    sections.forEach((sectionHeader, sectionIndex) => {
      const container = sectionHeader.parentElement;
      const stepHeaders = [...container.querySelectorAll(SEL.stepHeader)];
      if (!stepHeaders.length) {
        need(container, SEL.stepHeader, 'the step rows of a log section');
        return;
      }

      const chevron = need(stepHeaders[0], SEL.chevron, 'the disclosure chevron cloned for every copy control');
      if (!chevron) return;

      stepHeaders.forEach((stepHeader, stepIndex) => {
        const title = stepHeader.querySelector(SEL.stepTitle);
        const name = title ? title.textContent.trim() : null;
        attach(stepHeader.lastElementChild, chevron, `Copy the ${name || 'step'} log`, () =>
          withFallback(
            freshProps().then(props => composeStep(props, sectionIndex, stepIndex, name)),
            () => visibleStepText(stepHeader)
          ));
      });

      const titleNode = sectionHeader.querySelector(SEL.sectionTitle);
      const sectionName = titleNode ? titleNode.textContent.trim() : 'section';
      attach(sectionHeader.lastElementChild, chevron, `Copy all ${sectionName}`, () =>
        withFallback(
          freshProps().then(props => composeSection(props, sectionIndex, sectionName)),
          () => {
            const shown = stepHeaders.map(visibleStepText).filter(Boolean);
            return shown.length ? [`# ${sectionName}`].concat(shown).join('\n\n') : null;
          }
        ));
    });
  }

  // setTimeout, not rAF. See CLAUDE.md "SPA navigation".
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      try { apply(); } catch (error) { console.error(TAG, error); }
    }, 50);
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  for (const event of ['soft-nav:end', 'turbo:load', 'turbo:render', 'turbo:frame-render', 'pjax:end']) {
    document.addEventListener(event, schedule);
  }
  window.addEventListener('popstate', schedule);
  schedule();
})();
