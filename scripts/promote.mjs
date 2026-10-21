#!/usr/bin/env node
// CI's promote job (docs/HANDOFF.md → 2, item 6), after the image of a push to main: pins
// web in ryft-platform's EKS overlay to this commit on a branch deploy/web-<sha>, opens
// "deploy: web <sha>" listing this repository's commits since the running pin, closes an
// older web pin PR it supersedes, and turns auto-merge (squash) on. The platform's checks
// run on it, Argo CD deploys the merge, a revert rolls back. Does nothing when web is
// pinned to this commit already.
//   GH_TOKEN  the ryft-deploy App's token for ryft-platform (PRs it opens run the checks)
//   SLUG      the App's slug (its bot user commits)
//   PLATFORM  the checkout of ryft-platform (default ../plattform)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { commitList, pinWeb } from './lib/pin.mjs';

const REPO = 'timkrebs/ryft-platform';
const FILE = 'deploy/k8s/overlays/eks/kustomization.yaml';
const { GH_TOKEN, SLUG } = process.env;
if (!GH_TOKEN || !SLUG) throw new Error('promote: GH_TOKEN and SLUG (the ryft-deploy App) are required');
const platform = resolve(process.env.PLATFORM ?? '../plattform');

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const ok = (cmd, args) => {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const git = (...args) => run('git', ['-C', platform, ...args]);
const pr = (...args) => run('gh', ['pr', ...args, '-R', REPO]);

const sha = run('git', ['rev-parse', '--short=7', 'HEAD']);
const full = run('git', ['rev-parse', 'HEAD']);
const path = join(platform, FILE);
const { text, old } = pinWeb(readFileSync(path, 'utf8'), sha);
if (old === sha) {
  console.log(`promote: web is pinned to ${sha} already`);
  process.exit(0);
}

const known = /^[0-9a-f]{7}$/.test(old) && ok('git', ['cat-file', '-e', `${old}^{commit}`]);
const commits = known
  ? commitList(run('git', ['log', '--no-merges', '--format=- timkrebs/ryft-web@%h %s', `${old}..HEAD`]))
  : `- (the running pin \`${old}\` is not in this repository's history)`;

const uid = run('gh', ['api', `/users/${SLUG}%5Bbot%5D`, '--jq', '.id']);
git('config', 'user.name', `${SLUG}[bot]`);
git('config', 'user.email', `${uid}+${SLUG}[bot]@users.noreply.github.com`);
const branch = `deploy/web-${sha}`;
git('switch', '-q', '-c', branch);
writeFileSync(path, text);
git('commit', '-qam', `deploy: web ${sha}`);
git('push', '-q', 'origin', branch);

const body = join(mkdtempSync(join(tmpdir(), 'promote-')), 'body.md');
writeFileSync(
  body,
  [
    `Pins web to \`${sha}\` (running: \`${old}\`): \`ghcr.io/timkrebs/ryft/web:${sha}\`, built by timkrebs/ryft-web@${full} after its checks and Trivy passed.`,
    'Merges itself once the checks pass; Argo CD then syncs ryft-platform.',
    'Close this PR to stop the deploy. Rollback: revert the merge commit.',
    '',
    'Commits in ryft-web since the running pin:',
    '',
    commits,
    '',
  ].join('\n'),
);

// An older web pin edits the same line and would conflict: close it as superseded. The
// platform's own deploy/<sha> PRs edit other lines and stay.
const open = pr(
  'list',
  '--state',
  'open',
  '--json',
  'number,headRefName',
  '--jq',
  '.[] | select(.headRefName | startswith("deploy/web-")) | .number',
);
for (const n of open.split('\n').filter(Boolean)) {
  pr('close', n, '--delete-branch', '--comment', `Superseded by deploy: web ${sha}.`);
}
pr('create', '--base', 'main', '--head', branch, '--title', `deploy: web ${sha}`, '--body-file', body);
pr('merge', branch, '--auto', '--squash');
console.log(`promote: web ${old} → ${sha} in a ryft-platform PR`);
