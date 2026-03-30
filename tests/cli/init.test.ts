// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initProject } from '../../src/cli/init';

const tempDirs: string[] = [];

function cloneFixture(name: string): string {
  const sourceDir = path.resolve('tests/fixtures', name);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `agentux-init-${name}-`));
  fs.cpSync(sourceDir, tempDir, { recursive: true });
  tempDirs.push(tempDir);
  return tempDir;
}

describe('agentux init', () => {
  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('patches a Next.js App Router layout', () => {
    const projectDir = cloneFixture('nextjs-app');
    const result = initProject(projectDir);

    expect(result.status).toBe('patched');
    expect(result.framework).toBe('next-app');

    const layoutPath = path.join(projectDir, 'app/layout.tsx');
    const source = fs.readFileSync(layoutPath, 'utf8');

    expect(source).toContain("import { AppMap } from '@yamparala27/agentux';");
    expect(source).toContain('<body>{children}<AppMap /></body>');
  });

  it('patches a Next.js Pages Router _app file', () => {
    const projectDir = cloneFixture('nextjs-pages');
    const result = initProject(projectDir);

    expect(result.status).toBe('patched');
    expect(result.framework).toBe('next-pages');

    const appPath = path.join(projectDir, 'pages/_app.tsx');
    const source = fs.readFileSync(appPath, 'utf8');

    expect(source).toContain("import { AppMap } from '@yamparala27/agentux';");
    expect(source).toContain('<Component {...pageProps} />');
    expect(source).toContain('<AppMap />');
  });

  it('patches a standard React App root', () => {
    const projectDir = cloneFixture('react-app');
    const result = initProject(projectDir);

    expect(result.status).toBe('patched');
    expect(result.framework).toBe('react-app');

    const appPath = path.join(projectDir, 'src/App.tsx');
    const source = fs.readFileSync(appPath, 'utf8');

    expect(source).toContain("import { AppMap } from '@yamparala27/agentux';");
    expect(source).toContain('<main>');
    expect(source).toContain('<AppMap />');
  });

  it('is idempotent when run twice', () => {
    const projectDir = cloneFixture('react-app');

    const firstRun = initProject(projectDir);
    const secondRun = initProject(projectDir);
    const source = fs.readFileSync(path.join(projectDir, 'src/App.tsx'), 'utf8');

    expect(firstRun.status).toBe('patched');
    expect(secondRun.status).toBe('already-configured');
    expect(source.match(/<AppMap \/>/g)).toHaveLength(1);
  });
});
