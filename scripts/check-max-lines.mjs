#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MAX = 700;
const DEFAULT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.scss', '.css']);
const DEFAULT_IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'site', 'coverage']);

function parseArgs(argv) {
  const paths = [];
  let max = DEFAULT_MAX;
  let extensions = new Set(DEFAULT_EXTENSIONS);

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--max') {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('`--max` must be a positive number');
      }
      max = value;
      i += 1;
      continue;
    }

    if (arg === '--ext') {
      const value = argv[i + 1] ?? '';
      const parsed = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (item.startsWith('.') ? item : `.${item}`));

      if (parsed.length === 0) {
        throw new Error('`--ext` requires a non-empty comma-separated list');
      }

      extensions = new Set(parsed);
      i += 1;
      continue;
    }

    paths.push(arg);
  }

  return {
    max,
    extensions,
    targets: paths.length > 0 ? paths : ['src', 'designer/src'],
  };
}

function walk(target, extensions, violations) {
  if (!fs.existsSync(target)) return;

  const stats = fs.statSync(target);

  if (stats.isFile()) {
    collectFile(target, extensions, violations);
    return;
  }

  if (!stats.isDirectory()) return;

  const entries = fs.readdirSync(target, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
      walk(path.join(target, entry.name), extensions, violations);
      continue;
    }

    if (entry.isFile()) {
      collectFile(path.join(target, entry.name), extensions, violations);
    }
  }
}

function collectFile(filePath, extensions, violations) {
  const extension = path.extname(filePath);
  if (!extensions.has(extension)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length;
  violations.push({ filePath, lineCount });
}

function main() {
  const { max, extensions, targets } = parseArgs(process.argv.slice(2));
  const allFiles = [];

  for (const target of targets) {
    walk(path.resolve(process.cwd(), target), extensions, allFiles);
  }

  const violations = allFiles
    .filter((item) => item.lineCount > max)
    .sort((left, right) => right.lineCount - left.lineCount || left.filePath.localeCompare(right.filePath));

  if (violations.length === 0) {
    console.log(`max-lines check passed: no files above ${max} lines.`);
    return;
  }

  console.error(`max-lines check failed: found ${violations.length} file(s) above ${max} lines.`);
  for (const violation of violations) {
    const relativePath = path.relative(process.cwd(), violation.filePath);
    console.error(`- ${relativePath}: ${violation.lineCount} lines`);
  }

  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`max-lines check error: ${message}`);
  process.exitCode = 1;
}
