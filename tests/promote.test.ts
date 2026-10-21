import { describe, expect, it } from 'vitest';
import { commitList, pinWeb } from '../scripts/lib/pin.mjs';

// The images block of ryft-platform's deploy/k8s/overlays/eks/kustomization.yaml.
const overlay = `images:
  - name: ghcr.io/timkrebs/ryft/api
    newTag: "0fd4256"
  - name: ghcr.io/timkrebs/ryft/notify
    newTag: "0fd4256"
  # web: the short SHA of a green main run in timkrebs/ryft-web
  - name: ghcr.io/timkrebs/ryft/web
    newTag: "<ryft-web short sha>"
`;

describe('promote: the web pin in the platform overlay', () => {
  it('moves only web, quoted, and reports the running pin', () => {
    const { text, old } = pinWeb(overlay, 'abfbe26');
    expect(old).toBe('<ryft-web short sha>');
    expect(text).toContain('  - name: ghcr.io/timkrebs/ryft/web\n    newTag: "abfbe26"\n');
    expect(text.match(/newTag: "0fd4256"/g)).toHaveLength(2);
    expect(pinWeb(text, '1234567').old).toBe('abfbe26');
  });

  it('reads unquoted and single-quoted tags', () => {
    expect(pinWeb(overlay.replace('"<ryft-web short sha>"', '1015bc7'), 'abfbe26').old).toBe('1015bc7');
    expect(pinWeb(overlay.replace('"<ryft-web short sha>"', "'1015bc7'"), 'abfbe26').old).toBe('1015bc7');
  });

  it('refuses what is not a short SHA, or an overlay without web', () => {
    expect(() => pinWeb(overlay, 'abfbe26c09')).toThrow(/short SHA/);
    expect(() => pinWeb(overlay, 'latest')).toThrow(/short SHA/);
    expect(() => pinWeb(overlay.replace('ryft/web', 'ryft/www'), 'abfbe26')).toThrow(/no images entry/);
  });

  it("links this repository's PR numbers, not the platform's", () => {
    expect(commitList('- timkrebs/ryft-web@abfbe26 fix: fonts (#6)\n')).toBe(
      '- timkrebs/ryft-web@abfbe26 fix: fonts (timkrebs/ryft-web#6)',
    );
  });
});
