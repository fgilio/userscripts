// Reading a GitHub check's status on the PR Checks tab.
//
// The durable handle is the accessible name on each job's status icon, not a class:
//
//   "This job succeeded"  |  "This job failed"
//   "This job is waiting" |  "This job was skipped"
//
// Two traps, both found the hard way:
//
// 1. `checks-list-item` is on the workflow <summary> AND on every job row. So the
//    workflow selector must say `details` and the row selector must say `div`.
// 2. Rows stay in the DOM while their workflow is collapsed, which is what makes a
//    failure findable before anything has been opened. Do not open a workflow just
//    to inspect it.
//
// On the Conversation tab none of this applies: GitHub collapses the list on a green
// PR so the rows are absent, and the "N / M checks OK" summary icon appears once per
// commit in the timeline. Read the single merge box <h3> there instead
// ("All checks have passed" / "Some checks were not successful" /
// "Some checks haven't completed yet"), as `github-tab-title-numbers` does.

const GROUP = 'details.checks-list-item';
const ROW = 'div.checks-list-item';

// Lowest rank wins, so a workflow ranks as badly as its worst job.
const RANK = [
  [/fail|timed out|cancel|action required|error/i, 0],   // needs you now
  [/waiting|pending|queued|in progress|running|expected/i, 1],
  [/succeed|success|passed|neutral/i, 2],
  [/skip/i, 3],                                          // noise
];

// Anything unreadable is left alone rather than hoisted or buried.
const UNKNOWN_RANK = 2;

function statusLabel(row) {
  const icon = row.querySelector('svg[aria-label]') ?? row.querySelector('[aria-label]');
  return icon?.getAttribute('aria-label') ?? null;
}

function rowRank(row) {
  const label = statusLabel(row);
  if (!label) return UNKNOWN_RANK;
  for (const [pattern, rank] of RANK) if (pattern.test(label)) return rank;
  return UNKNOWN_RANK;
}

function groupRank(group) {
  const rows = [...group.querySelectorAll(ROW)];
  return rows.length ? Math.min(...rows.map(rowRank)) : UNKNOWN_RANK;
}

function hasFailure(group) {
  return [...group.querySelectorAll(ROW)].some(row => rowRank(row) === 0);
}

// The workflow name is the first non-empty line of the summary, which renders the
// name and then "on: <event>". There is no bold wrapper, no aria-label and no
// unhashed class, so the text is the most durable thing on offer.
function groupName(group) {
  const summary = group.querySelector('summary');
  if (!summary) return null;
  return summary.textContent.trim().split('\n').map(s => s.trim()).find(Boolean) ?? null;
}
