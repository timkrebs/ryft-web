// The web image's pin in ryft-platform's EKS overlay (deploy/k8s/overlays/eks/kustomization.yaml):
//   - name: ghcr.io/timkrebs/ryft/web
//     newTag: "<short sha>"
// scripts/promote.mjs moves it; the platform's own promote moves only the five service images.

export const WEB_IMAGE = 'ghcr.io/timkrebs/ryft/web';

/**
 * The overlay with web's `newTag` set to `sha` (quoted: a short SHA like 1234567 is a number
 * to YAML), and the tag it replaced.
 * @param {string} text
 * @param {string} sha
 * @returns {{ text: string, old: string }}
 */
export function pinWeb(text, sha) {
  if (!/^[0-9a-f]{7}$/.test(sha)) throw new Error(`pin: ${sha} is not a 7-digit short SHA`);
  const lines = text.split('\n');
  const i = lines.findIndex((l) => /^\s*- name: ghcr\.io\/timkrebs\/ryft\/web\s*$/.test(l));
  if (i < 0) throw new Error(`pin: no images entry for ${WEB_IMAGE}`);
  const m = lines[i + 1]?.match(/^(\s*)newTag:\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/);
  if (!m) throw new Error(`pin: no newTag right after ${WEB_IMAGE}`);
  lines[i + 1] = `${m[1]}newTag: "${sha}"`;
  return { text: lines.join('\n'), old: m[2] ?? m[3] ?? m[4] };
}

/** This repository's commits as a list for a PR in ryft-platform: `(#9)` would link there. */
export function commitList(log) {
  return log
    .split('\n')
    .filter(Boolean)
    .slice(0, 100)
    .map((l) => l.replace(/\(#(\d+)\)/g, '(timkrebs/ryft-web#$1)'))
    .join('\n');
}
