import fs from 'node:fs';
import path from 'node:path';
import { analyzeProject } from '../analysis';

export interface ScanProjectOptions {
  outputFile?: string;
}

export interface ScanProjectResult {
  outputFile: string;
  routeCount: number;
  edgeCount: number;
  framework: string;
  message: string;
}

export async function scanProject(
  projectDir: string,
  options: ScanProjectOptions = {},
): Promise<ScanProjectResult> {
  const resolvedProjectDir = path.resolve(projectDir);
  const outputFile = path.resolve(
    resolvedProjectDir,
    options.outputFile ?? path.join('public', 'agentux.json'),
  );

  const data = await analyzeProject(resolvedProjectDir);

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));

  return {
    outputFile,
    routeCount: data.routes.length,
    edgeCount: data.edges.length,
    framework: data.framework,
    message: `Wrote ${data.routes.length} screens and ${data.edges.length} flows to ${path.relative(
      resolvedProjectDir,
      outputFile,
    )}.`,
  };
}
