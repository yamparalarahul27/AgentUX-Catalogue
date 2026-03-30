import { execFileSync } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const raw = execFileSync('npm', ['pack', '--json'], {
  cwd,
  encoding: 'utf8',
});

const jsonMatch = raw.match(/(\[\s*\{[\s\S]*\}\s*\])\s*$/);
const jsonPayload = jsonMatch?.[1] ?? raw.trim();
const parsed = JSON.parse(jsonPayload);
const packResult = Array.isArray(parsed) ? parsed[0] : parsed;

if (!packResult?.filename) {
  throw new Error('npm pack did not return a tarball filename.');
}

const tarballPath = path.resolve(cwd, packResult.filename);
const tarballLink = `file:${tarballPath}`;

console.log(`Local package ready: ${tarballPath}`);
console.log(`Install with: npm install ${tarballLink}`);
console.log(`package.json dependency: "${packResult.name}": "${tarballLink}"`);
