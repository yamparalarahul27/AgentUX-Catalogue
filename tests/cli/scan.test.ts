// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanProject } from '../../src/cli/scan';

const tempDirs: string[] = [];

function cloneFixture(name: string): string {
  const sourceDir = path.resolve('tests/fixtures', name);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `agentux-scan-${name}-`));
  fs.cpSync(sourceDir, tempDir, { recursive: true });
  tempDirs.push(tempDir);
  return tempDir;
}

describe('agentux scan', () => {
  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('writes a public agentux.json file for a detected project', async () => {
    const projectDir = cloneFixture('nextjs-app');

    const result = await scanProject(projectDir);
    const outputPath = path.join(projectDir, 'public', 'agentux.json');
    const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

    expect(result.outputFile).toBe(outputPath);
    expect(result.routeCount).toBeGreaterThan(0);
    expect(payload.routes.some((route: { path: string }) => route.path === '/')).toBe(true);
    expect(payload.framework).toBe('nextjs-app');
  });
});
