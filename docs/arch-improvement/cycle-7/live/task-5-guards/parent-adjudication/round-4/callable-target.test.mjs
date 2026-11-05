import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyFileExportsMain } from './frozen-runner-verify.ts';

const directory = mkdtempSync(join(tmpdir(), 'dz-frozen-r3-callable-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const cases = [
  ['primitive-returning call', 'export const main = Number("17");', false],
  ['primitive identifier', 'const n = 17; export const main = n;', false],
  ['primitive named re-export', 'const n = 17; export { n as main };', false],
  ['genuine function', 'export function main() {}', true],
];
for (const [name, code, expected] of cases) {
  test(name, { timeout: 1000 }, () => {
    const file = join(directory, name.replaceAll(' ', '-') + '.mjs');
    writeFileSync(file, code);
    assert.equal(verifyFileExportsMain(file), expected, code);
  });
}
