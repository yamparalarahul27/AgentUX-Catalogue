import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import generateModule from '@babel/generator';
import traverseModule, { type NodePath } from '@babel/traverse';
import * as t from '@babel/types';

const PACKAGE_NAME = '@yamparala27/agentux';
const generate = (
  'default' in generateModule ? generateModule.default : generateModule
) as typeof import('@babel/generator').default;
const traverse = (
  'default' in traverseModule ? traverseModule.default : traverseModule
) as typeof import('@babel/traverse').default;

type TargetMode = 'next-app-layout' | 'component-root' | 'render-root';

interface TargetSpec {
  file: string;
  framework: 'next-app' | 'next-pages' | 'react-app' | 'react-main';
  mode: TargetMode;
  preferredNames: string[];
}

export interface InitResult {
  status: 'patched' | 'already-configured' | 'unsupported';
  framework?: TargetSpec['framework'];
  targetFile?: string;
  message: string;
}

export function initProject(projectDir: string): InitResult {
  const target = detectTarget(projectDir);

  if (!target) {
    return {
      status: 'unsupported',
      message:
        'Could not find a supported root file. AgentUX currently supports Next.js App Router (`app/layout.*`), Next.js Pages Router (`pages/_app.*`), and React app roots (`src/App.*` or `src/main.*`).',
    };
  }

  const source = fs.readFileSync(target.file, 'utf8');
  const result = injectAppMapIntoSource(source, target);

  if (result.changed) {
    fs.writeFileSync(target.file, result.code);
    return {
      status: 'patched',
      framework: target.framework,
      targetFile: target.file,
      message: `Mounted AgentUX in ${path.relative(projectDir, target.file) || path.basename(target.file)}.`,
    };
  }

  return {
    status: 'already-configured',
    framework: target.framework,
    targetFile: target.file,
    message: `AgentUX is already configured in ${path.relative(projectDir, target.file) || path.basename(target.file)}.`,
  };
}

export function detectTarget(projectDir: string): TargetSpec | null {
  const nextAppLayout = findFirstExisting(projectDir, [
    'app/layout.tsx',
    'app/layout.jsx',
    'app/layout.ts',
    'app/layout.js',
    'src/app/layout.tsx',
    'src/app/layout.jsx',
    'src/app/layout.ts',
    'src/app/layout.js',
  ]);

  if (nextAppLayout) {
    return {
      file: nextAppLayout,
      framework: 'next-app',
      mode: 'next-app-layout',
      preferredNames: ['RootLayout'],
    };
  }

  const nextPagesApp = findFirstExisting(projectDir, [
    'pages/_app.tsx',
    'pages/_app.jsx',
    'pages/_app.ts',
    'pages/_app.js',
    'src/pages/_app.tsx',
    'src/pages/_app.jsx',
    'src/pages/_app.ts',
    'src/pages/_app.js',
  ]);

  if (nextPagesApp) {
    return {
      file: nextPagesApp,
      framework: 'next-pages',
      mode: 'component-root',
      preferredNames: ['MyApp', 'App'],
    };
  }

  const reactApp = findFirstExisting(projectDir, [
    'src/App.tsx',
    'src/App.jsx',
    'src/App.ts',
    'src/App.js',
    'App.tsx',
    'App.jsx',
    'App.ts',
    'App.js',
  ]);

  if (reactApp) {
    return {
      file: reactApp,
      framework: 'react-app',
      mode: 'component-root',
      preferredNames: ['App'],
    };
  }

  const reactMain = findFirstExisting(projectDir, [
    'src/main.tsx',
    'src/main.jsx',
    'main.tsx',
    'main.jsx',
  ]);

  if (reactMain) {
    return {
      file: reactMain,
      framework: 'react-main',
      mode: 'render-root',
      preferredNames: [],
    };
  }

  return null;
}

function findFirstExisting(projectDir: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const absolutePath = path.join(projectDir, candidate);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return null;
}

function injectAppMapIntoSource(source: string, target: TargetSpec): { code: string; changed: boolean } {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: getParserPlugins(target.file),
  });

  const importChanged = ensureAppMapImport(ast);
  const alreadyUsesAppMap = hasAppMapUsage(ast);

  if (alreadyUsesAppMap) {
    return {
      code: printAst(ast, source),
      changed: importChanged,
    };
  }

  const injected = injectAppMap(ast, target);
  if (!injected) {
    throw new Error(`Found ${path.basename(target.file)}, but could not find a JSX root to mount AgentUX into.`);
  }

  return {
    code: printAst(ast, source),
    changed: true,
  };
}

function getParserPlugins(filePath: string): Array<'jsx' | 'typescript' | 'importMeta'> {
  const ext = path.extname(filePath).toLowerCase();
  const plugins: Array<'jsx' | 'typescript' | 'importMeta'> = ['importMeta'];

  if (ext === '.ts' || ext === '.tsx') {
    plugins.push('typescript');
  }

  if (ext === '.jsx' || ext === '.tsx' || ext === '.js') {
    plugins.push('jsx');
  }

  return plugins;
}

function ensureAppMapImport(ast: t.File): boolean {
  let packageImport: t.ImportDeclaration | null = null;

  for (const statement of ast.program.body) {
    if (!t.isImportDeclaration(statement)) continue;
    if (statement.source.value !== PACKAGE_NAME) continue;
    packageImport = statement;
    break;
  }

  if (packageImport) {
    const hasNamedSpecifier = packageImport.specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported) &&
        specifier.imported.name === 'AppMap',
    );

    if (hasNamedSpecifier) {
      return false;
    }

    packageImport.specifiers.push(
      t.importSpecifier(t.identifier('AppMap'), t.identifier('AppMap')),
    );
    return true;
  }

  ast.program.body.unshift(
    t.importDeclaration(
      [t.importSpecifier(t.identifier('AppMap'), t.identifier('AppMap'))],
      t.stringLiteral(PACKAGE_NAME),
    ),
  );

  return true;
}

function hasAppMapUsage(ast: t.File): boolean {
  let found = false;

  traverse(ast, {
    JSXOpeningElement(path) {
      if (isAppMapName(path.node.name)) {
        found = true;
        path.stop();
      }
    },
  });

  return found;
}

function injectAppMap(ast: t.File, target: TargetSpec): boolean {
  switch (target.mode) {
    case 'next-app-layout':
      return injectIntoBody(ast);
    case 'render-root':
      return injectIntoRenderCall(ast);
    case 'component-root':
      return injectIntoComponentRoot(ast, target.preferredNames);
    default:
      return false;
  }
}

function injectIntoBody(ast: t.File): boolean {
  let changed = false;

  traverse(ast, {
    JSXElement(path) {
      if (!isJsxIdentifier(path.node.openingElement.name, 'body')) {
        return;
      }

      path.node.children.push(buildAppMapElement());
      changed = true;
      path.stop();
    },
  });

  return changed;
}

function injectIntoRenderCall(ast: t.File): boolean {
  let changed = false;

  traverse(ast, {
    CallExpression(path) {
      if (!t.isMemberExpression(path.node.callee)) return;
      if (!t.isIdentifier(path.node.callee.property, { name: 'render' })) return;

      const [firstArg] = path.get('arguments');
      if (!firstArg || (!firstArg.isJSXElement() && !firstArg.isJSXFragment())) return;

      firstArg.replaceWith(withAppMap(firstArg.node));
      changed = true;
      path.stop();
    },
  });

  return changed;
}

function injectIntoComponentRoot(ast: t.File, preferredNames: string[]): boolean {
  const targetPath = findBestJsxRootPath(ast, preferredNames);

  if (!targetPath) {
    return false;
  }

  targetPath.replaceWith(withAppMap(targetPath.node));
  return true;
}

function findBestJsxRootPath(
  ast: t.File,
  preferredNames: string[],
): NodePath<t.JSXElement | t.JSXFragment> | null {
  const defaultExportNames = collectDefaultExportNames(ast);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestPath: NodePath<t.JSXElement | t.JSXFragment> | null = null;

  const consider = (path: NodePath<t.JSXElement | t.JSXFragment>, functionPath: NodePath<t.Function> | null) => {
    const functionName = getFunctionName(functionPath);
    const isDefaultExport = isDefaultExportFunction(functionPath, defaultExportNames);
    const score = scoreFunction(functionName, isDefaultExport, preferredNames);

    if (score > bestScore) {
      bestScore = score;
      bestPath = path;
    }
  };

  traverse(ast, {
    ReturnStatement(path) {
      const argument = path.get('argument');
      if (!argument.isJSXElement() && !argument.isJSXFragment()) return;

      consider(argument, path.getFunctionParent());
    },
    ArrowFunctionExpression(path) {
      const body = path.get('body');
      if (!body.isJSXElement() && !body.isJSXFragment()) return;

      consider(body, path as NodePath<t.Function>);
    },
  });

  return bestPath;
}

function collectDefaultExportNames(ast: t.File): Set<string> {
  const names = new Set<string>();

  for (const statement of ast.program.body) {
    if (!t.isExportDefaultDeclaration(statement)) continue;

    const declaration = statement.declaration;
    if (t.isIdentifier(declaration)) {
      names.add(declaration.name);
    } else if ((t.isFunctionDeclaration(declaration) || t.isClassDeclaration(declaration)) && declaration.id) {
      names.add(declaration.id.name);
    }
  }

  return names;
}

function getFunctionName(functionPath: NodePath<t.Function> | null): string | null {
  if (!functionPath) return null;

  if ('id' in functionPath.node && functionPath.node.id?.name) {
    return functionPath.node.id.name;
  }

  if (functionPath.parentPath?.isVariableDeclarator() && t.isIdentifier(functionPath.parentPath.node.id)) {
    return functionPath.parentPath.node.id.name;
  }

  return null;
}

function isDefaultExportFunction(functionPath: NodePath<t.Function> | null, defaultExportNames: Set<string>): boolean {
  if (!functionPath) return false;

  if (functionPath.parentPath?.isExportDefaultDeclaration()) {
    return true;
  }

  const functionName = getFunctionName(functionPath);
  return Boolean(functionName && defaultExportNames.has(functionName));
}

function scoreFunction(name: string | null, isDefaultExport: boolean, preferredNames: string[]): number {
  let score = 0;

  if (name && preferredNames.includes(name)) {
    score += 50;
  }

  if (isDefaultExport) {
    score += 40;
  }

  if (name) {
    score += 10;
  }

  return score;
}

function withAppMap(root: t.JSXElement | t.JSXFragment): t.JSXElement | t.JSXFragment {
  const appMapElement = buildAppMapElement();

  if (t.isJSXFragment(root)) {
    return t.jsxFragment(
      t.jsxOpeningFragment(),
      t.jsxClosingFragment(),
      [...root.children.map((child) => t.cloneNode(child, true)), appMapElement],
    );
  }

  if (root.openingElement.selfClosing || !root.closingElement) {
    return t.jsxFragment(
      t.jsxOpeningFragment(),
      t.jsxClosingFragment(),
      [t.cloneNode(root, true), appMapElement],
    );
  }

  return t.jsxElement(
    t.cloneNode(root.openingElement, true),
    t.cloneNode(root.closingElement, true),
    [...root.children.map((child) => t.cloneNode(child, true)), appMapElement],
    false,
  );
}

function buildAppMapElement(): t.JSXElement {
  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier('AppMap'), [], true),
    null,
    [],
    true,
  );
}

function isAppMapName(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): boolean {
  return isJsxIdentifier(name, 'AppMap');
}

function isJsxIdentifier(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
  expected: string,
): boolean {
  return t.isJSXIdentifier(name) && name.name === expected;
}

function printAst(ast: t.File, source: string): string {
  return `${generate(
    ast,
    {
      retainLines: false,
      compact: false,
      concise: false,
      jsescOption: { quotes: 'single' },
    },
    source,
  ).code}\n`;
}
