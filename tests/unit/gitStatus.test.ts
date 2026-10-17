import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseGitStatus } = require('../../electron/services/git-status.cjs') as { parseGitStatus(output: string, prefix?: string): { path: string; index: string; working: string; originalPath?: string }[] };

describe('Git porcelain status', () => {
  it('preserves literal paths, leading spaces, and Unicode names', () => {
    expect(parseGitStatus(' M notes[1].txt\0??  résumé 文.txt\0')).toEqual([
      { index: ' ', working: 'M', path: 'notes[1].txt' },
      { index: '?', working: '?', path: ' résumé 文.txt' },
    ]);
  });
  it('retains both sides of renames without swallowing the following change', () => {
    expect(parseGitStatus('R  after.txt\0before.txt\0 D deleted.txt\0', '@root/')).toEqual([
      { index: 'R', working: ' ', path: '@root/after.txt', originalPath: '@root/before.txt' },
      { index: ' ', working: 'D', path: '@root/deleted.txt' },
    ]);
  });
  it('handles a clean repository', () => { expect(parseGitStatus('')).toEqual([]); });
});
