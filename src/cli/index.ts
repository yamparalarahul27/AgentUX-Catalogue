import path from 'node:path';
import process from 'node:process';
import { initProject } from './init';
import { scanProject } from './scan';

function printUsage(): void {
  console.log(`AgentUX CLI

Usage:
  agentux init [project-path]
  agentux scan [project-path] [--output public/agentux.json]

Examples:
  agentux init
  agentux init ../my-app
  agentux scan
  agentux scan ../my-app --output public/agentux.json
`);
}

function parseScanArgs(args: string[]): { projectPath: string; outputFile?: string } {
  let projectPath = '.';
  let outputFile: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === '--output' || token === '-o') {
      outputFile = args[index + 1];
      index += 1;
      continue;
    }

    if (!token.startsWith('-')) {
      projectPath = token;
    }
  }

  return { projectPath, outputFile };
}

async function main(): Promise<void> {
  const [, , command, ...restArgs] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command !== 'init' && command !== 'scan') {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  try {
    if (command === 'init') {
      const projectDir = path.resolve(process.cwd(), restArgs[0] ?? '.');
      const result = initProject(projectDir);

      if (result.status === 'unsupported') {
        console.error(result.message);
        process.exitCode = 1;
        return;
      }

      console.log(result.message);

      if (result.targetFile) {
        console.log(`Target file: ${result.targetFile}`);
      }
      return;
    }

    const { projectPath, outputFile } = parseScanArgs(restArgs);
    const projectDir = path.resolve(process.cwd(), projectPath);
    const result = await scanProject(projectDir, { outputFile });

    console.log(result.message);
    console.log(`Framework: ${result.framework}`);
    console.log(`Output file: ${result.outputFile}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`AgentUX ${command} failed: ${message}`);
    process.exitCode = 1;
  }
}

void main();
