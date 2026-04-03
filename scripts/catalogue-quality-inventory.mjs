#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = traverseModule.default ?? traverseModule;

const ROOT_DIR = process.cwd();
const COMPONENTS_DIR = path.join(ROOT_DIR, 'designer', 'src', 'components');
const OUTPUT_DIR = path.join(ROOT_DIR, 'docs', 'local');
const JSON_OUTPUT_PATH = path.join(OUTPUT_DIR, 'catalogue-action-inventory.json');
const MARKDOWN_OUTPUT_PATH = path.join(OUTPUT_DIR, 'catalogue-action-inventory.md');
const TARGET_EVENTS = ['onClick', 'onChange', 'onSubmit', 'onKeyDown'];
const EXTRA_COMPONENT_FILES = new Set(['FlowAssignModal.tsx', 'ConfirmModal.tsx', 'Dropdown.tsx']);
const SURFACE_HINTS = [
  ['catalogue-upload', 'upload-modal'],
  ['catalogue-quick-upload', 'quick-upload'],
  ['catalogue-settings', 'settings-modal'],
  ['catalogue-duplicate', 'duplicate-variant-modal'],
  ['catalogue-gallery', 'gallery-view'],
  ['catalogue-list', 'list-view'],
  ['catalogue-card', 'card'],
  ['catalogue-header', 'header'],
  ['catalogue-toolbar', 'toolbar'],
  ['catalogue-bulk', 'bulk-bar'],
  ['catalogue-flow-sidebar', 'flow-navigation'],
  ['catalogue-flow-sheet', 'flow-navigation'],
  ['flow-assign', 'flow-assign-modal'],
  ['confirm-modal', 'confirm-modal'],
  ['dropdown', 'dropdown'],
];
const ALL_VIEWPORTS = [1512, 1024, 720, 320];
const DESKTOP_VIEWPORTS = [1512, 1024];
const MOBILE_VIEWPORTS = [720, 320];

function main() {
  const targetFiles = getTargetFiles();
  const inventoryItems = targetFiles.flatMap((filePath) => scanFile(filePath));
  const payload = {
    generated_at: new Date().toISOString(),
    root: ROOT_DIR,
    scanned_files: targetFiles.map((filePath) => path.relative(ROOT_DIR, filePath)),
    total_features: inventoryItems.length,
    items: inventoryItems,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(MARKDOWN_OUTPUT_PATH, renderMarkdown(payload), 'utf8');

  console.log(
    `catalogue inventory written: ${inventoryItems.length} actions across ${targetFiles.length} files.`,
  );
  console.log(`- ${path.relative(ROOT_DIR, JSON_OUTPUT_PATH)}`);
  console.log(`- ${path.relative(ROOT_DIR, MARKDOWN_OUTPUT_PATH)}`);
}

function getTargetFiles() {
  const entries = fs.readdirSync(COMPONENTS_DIR, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => {
      if (!name.endsWith('.tsx')) return false;
      return name.startsWith('Catalogue') || EXTRA_COMPONENT_FILES.has(name);
    })
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(COMPONENTS_DIR, name));
}

function scanFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const relativeFilePath = path.relative(ROOT_DIR, filePath);
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });
  const components = collectComponentRanges(ast, filePath);
  const items = [];

  traverse(ast, {
    JSXOpeningElement(elementPath) {
      const item = buildInventoryItem({
        astPath: elementPath,
        code,
        filePath: relativeFilePath,
        components,
      });

      if (item) {
        items.push(item);
      }
    },
  });

  return items.sort((left, right) => {
    if (left.source === right.source) return left.feature_id.localeCompare(right.feature_id);
    return left.source.localeCompare(right.source);
  });
}

function collectComponentRanges(ast, filePath) {
  const ranges = [];
  const fallbackName = path.basename(filePath, path.extname(filePath));

  traverse(ast, {
    FunctionDeclaration(functionPath) {
      const name = functionPath.node.id?.name;
      if (!isPascalCase(name)) return;
      ranges.push({
        name,
        start: functionPath.node.start ?? 0,
        end: functionPath.node.end ?? 0,
      });
    },
    VariableDeclarator(variablePath) {
      const name = variablePath.node.id.type === 'Identifier' ? variablePath.node.id.name : null;
      if (!isPascalCase(name)) return;

      const init = variablePath.node.init;
      if (!init) return;
      if (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') return;

      ranges.push({
        name,
        start: init.start ?? variablePath.node.start ?? 0,
        end: init.end ?? variablePath.node.end ?? 0,
      });
    },
  });

  ranges.sort((left, right) => {
    const leftSize = left.end - left.start;
    const rightSize = right.end - right.start;
    return leftSize - rightSize || left.start - right.start;
  });

  return {
    fallbackName,
    ranges,
  };
}

function buildInventoryItem({ astPath, code, filePath, components }) {
  const openingElement = astPath.node;
  const tagName = getJsxName(openingElement.name);
  const attributes = getAttributeMap(openingElement.attributes, code);
  const events = TARGET_EVENTS.filter((eventName) => Boolean(attributes[eventName]));
  const roleValue = attributes.role?.string_value ?? null;
  const interactive = tagName === 'button' || roleValue === 'button' || events.length > 0;

  if (!interactive) return null;

  const component = resolveComponentName(components, openingElement.start);
  const sourceLine = openingElement.loc?.start.line ?? 0;
  const sourceColumn = openingElement.loc?.start.column ?? 0;
  const source = `${filePath}:${sourceLine}`;
  const className = attributes.className?.string_value ?? '';
  const ancestorClassNames = collectAncestorClassNames(astPath);
  const contextClassNames = normalizeWhitespace([className, ...ancestorClassNames].join(' '));
  const action = deriveActionLabel(astPath, attributes, tagName);
  const selectorHint = deriveSelectorHint(tagName, attributes, className, action, component);
  const viewportCoverage = deriveViewportCoverage(component, contextClassNames, source, tagName);
  const surface = deriveSurface(component, contextClassNames, source);
  const handlerSources = Object.fromEntries(
    events.map((eventName) => [eventName, attributes[eventName]?.expression_source ?? '']),
  );
  const expectedOutcome = deriveExpectedOutcome({
    action,
    component,
    events,
    handlerSources,
    selectorHint,
    source,
    surface,
    tagName,
  });

  return {
    feature_id: buildFeatureId(component, filePath, sourceLine, action, tagName),
    component,
    source,
    source_column: sourceColumn,
    action,
    surface,
    expected_outcome: expectedOutcome,
    selector_hint: selectorHint,
    viewport_coverage: viewportCoverage,
    tag_name: tagName,
    events,
    role: roleValue,
    class_name: className || null,
    handler_sources: handlerSources,
  };
}

function getAttributeMap(attributes, code) {
  const map = {};

  for (const attribute of attributes) {
    if (attribute.type !== 'JSXAttribute') continue;
    const name = getJsxName(attribute.name);
    map[name] = {
      name,
      string_value: getStaticAttributeValue(attribute.value),
      expression_source: getExpressionSource(attribute.value, code),
    };
  }

  return map;
}

function getStaticAttributeValue(value) {
  if (!value) return 'true';
  if (value.type === 'StringLiteral') return normalizeWhitespace(value.value);
  if (value.type !== 'JSXExpressionContainer') return null;
  return extractStaticString(value.expression);
}

function getExpressionSource(value, code) {
  if (!value) return '';
  if (value.type === 'StringLiteral') return JSON.stringify(value.value);
  if (value.type !== 'JSXExpressionContainer') return '';
  if (value.expression.start == null || value.expression.end == null) return '';
  return code.slice(value.expression.start, value.expression.end).trim();
}

function extractStaticString(node) {
  if (!node) return null;

  switch (node.type) {
    case 'StringLiteral':
      return normalizeWhitespace(node.value);
    case 'TemplateLiteral': {
      const cooked = node.quasis.map((quasi) => quasi.value.cooked ?? '').join('');
      return normalizeWhitespace(cooked);
    }
    case 'BinaryExpression': {
      if (node.operator !== '+') return null;
      const left = extractStaticString(node.left);
      const right = extractStaticString(node.right);
      if (left == null || right == null) return null;
      return normalizeWhitespace(`${left}${right}`);
    }
    case 'ConditionalExpression':
      return extractStaticString(node.consequent) ?? extractStaticString(node.alternate);
    case 'LogicalExpression':
      return extractStaticString(node.right) ?? extractStaticString(node.left);
    default:
      return null;
  }
}

function resolveComponentName(components, nodeStart) {
  if (nodeStart == null) return components.fallbackName;
  const match = components.ranges.find((range) => nodeStart >= range.start && nodeStart <= range.end);
  return match?.name ?? components.fallbackName;
}

function deriveActionLabel(astPath, attributes, tagName) {
  const ancestorLabelText = findAncestorLabelText(astPath);
  const handlerLabel = deriveLabelFromHandlers(attributes);
  const elementText = isTextDrivenTag(tagName) ? extractElementText(astPath.parentPath?.node) : '';
  const candidateValues = [
    attributes['aria-label']?.string_value,
    attributes.title?.string_value,
    attributes.placeholder?.string_value,
    ancestorLabelText,
    elementText,
    attributes.alt?.string_value,
    handlerLabel,
    attributes.name?.string_value,
  ].filter(Boolean);

  const firstCandidate = candidateValues.find((value) => normalizeWhitespace(value).length > 0);
  if (firstCandidate) {
    const normalized = normalizeWhitespace(firstCandidate);
    if (!isContainerLikeTag(tagName) || normalized.length <= 64 || handlerLabel === normalized) {
      return normalized;
    }
  }

  if (handlerLabel) return handlerLabel;

  if (tagName === 'input' && attributes.type?.string_value) {
    return `${attributes.type.string_value} input`;
  }

  if (tagName === 'form') return 'Form submit';
  if (tagName === 'Dropdown') return attributes.placeholder?.string_value || 'Dropdown control';

  return `${humanizeTagName(tagName)} action`;
}

function extractElementText(node) {
  if (!node || node.type !== 'JSXElement') return '';

  const text = [];
  for (const child of node.children) {
    if (child.type === 'JSXText') {
      text.push(child.value);
      continue;
    }

    if (child.type === 'JSXExpressionContainer') {
      const staticValue = extractStaticString(child.expression);
      if (staticValue) text.push(staticValue);
      continue;
    }

    if (child.type === 'JSXElement') {
      const nestedName = getJsxName(child.openingElement.name);
      if (nestedName === 'svg') continue;
      const nestedText = extractElementText(child);
      if (nestedText) text.push(nestedText);
    }
  }

  return normalizeWhitespace(text.join(' '));
}

function findAncestorLabelText(astPath) {
  let current = astPath.parentPath;

  while (current) {
    if (current.node.type === 'JSXElement') {
      const name = getJsxName(current.node.openingElement.name);
      if (name === 'label') {
        return extractElementText(current.node);
      }
    }

    current = current.parentPath;
  }

  return '';
}

function deriveSelectorHint(tagName, attributes, className, action, component) {
  if (attributes.id?.string_value) {
    return `#${escapeSelectorToken(attributes.id.string_value)}`;
  }

  if (tagName === 'input' && attributes.name?.string_value) {
    return `input[name="${attributes.name.string_value}"]`;
  }

  if (tagName === 'input' && attributes.type?.string_value) {
    return `input[type="${attributes.type.string_value}"]`;
  }

  if (className) {
    const classSelector = className
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .map((token) => `.${escapeSelectorToken(token)}`)
      .join('');
    if (classSelector) return `${tagName}${classSelector}`;
  }

  if (attributes['aria-label']?.string_value) {
    return `${tagName}[aria-label="${attributes['aria-label'].string_value}"]`;
  }

  if (attributes.title?.string_value) {
    return `${tagName}[title="${attributes.title.string_value}"]`;
  }

  if (attributes.placeholder?.string_value) {
    return `${tagName}[placeholder="${attributes.placeholder.string_value}"]`;
  }

  if (action) {
    return `${tagName}:has-text("${truncate(action, 48)}")`;
  }

  return `${tagName}@${component}`;
}

function deriveViewportCoverage(component, className, source, tagName) {
  const haystack = `${component} ${className} ${source} ${tagName}`.toLowerCase();

  if (haystack.includes('catalogue-mobile-flow-sheet') || haystack.includes('flow-sheet-trigger')) {
    return [...MOBILE_VIEWPORTS];
  }

  if (haystack.includes('catalogue-flow-sidebar')) {
    return [...DESKTOP_VIEWPORTS];
  }

  if (
    haystack.includes('catalogue-toolbar')
    || haystack.includes('catalogue-header')
    || haystack.includes('catalogue-list')
    || haystack.includes('catalogue-gallery')
    || haystack.includes('catalogue-card')
    || haystack.includes('catalogue-upload')
    || haystack.includes('catalogue-settings')
    || haystack.includes('catalogue-bulk')
  ) {
    return [...ALL_VIEWPORTS];
  }

  if (component === 'Dropdown' || component === 'ConfirmModal' || component === 'FlowAssignModal') {
    return [...ALL_VIEWPORTS];
  }

  return [...ALL_VIEWPORTS];
}

function deriveSurface(component, className, source) {
  const haystack = `${component} ${className} ${source}`.toLowerCase();

  for (const [needle, surface] of SURFACE_HINTS) {
    if (haystack.includes(needle)) return surface;
  }

  if (haystack.includes('header')) return 'header';
  if (haystack.includes('toolbar')) return 'toolbar';
  if (haystack.includes('gallery')) return 'gallery-view';
  if (haystack.includes('list')) return 'list-view';
  if (haystack.includes('card')) return 'card';
  if (haystack.includes('modal')) return 'modal';

  return 'content';
}

function deriveExpectedOutcome({
  action,
  component,
  events,
  handlerSources,
  selectorHint,
  source,
  surface,
  tagName,
}) {
  const combined = normalizeWhitespace(
    [
      action,
      component,
      surface,
      source,
      selectorHint,
      ...Object.values(handlerSources),
    ].join(' '),
  ).toLowerCase();

  if (combined.includes('dismiss') || combined.includes('prevent overlay dismissal') || combined.includes('cancel') || combined.includes('close')) {
    return 'Close or dismiss the current surface.';
  }
  if (combined.includes('change group')) return 'Change, assign, or scope the active group.';
  if (combined.includes('assign flow') || combined.includes('unassign')) return 'Assign or unassign the current flow.';
  if (combined.includes('quick upload')) return 'Open or execute the quick upload flow.';
  if (combined.includes('upload')) {
    if (tagName === 'input' && events.includes('onChange')) return 'Select files for upload.';
    return 'Open or execute the upload flow.';
  }
  if (combined.includes('search')) return 'Update the catalogue search query.';
  if (combined.includes('sort')) return 'Change the catalogue sort order.';
  if (combined.includes('view mode') || combined.includes('catalogueviewtoggle') || combined.includes('gallery') || combined.includes('list view')) {
    return 'Switch the active catalogue view.';
  }
  if (combined.includes('filter')) return 'Open the filter menu or change the active filter.';
  if (combined.includes('project')) return 'Change the active project scope.';
  if (combined.includes('group')) return 'Change, assign, or scope the active group.';
  if (combined.includes('theme')) return 'Change the active theme selection.';
  if (combined.includes('platform')) return 'Change the platform assignment or filter.';
  if (combined.includes('preset')) return 'Change the preset selection.';
  if (combined.includes('flow')) {
    if (combined.includes('toggle') || combined.includes('expanded')) {
      return 'Open, close, or toggle flow navigation.';
    }
    if (combined.includes('assign')) return 'Assign or unassign the current flow.';
    return 'Change the active flow selection or scope.';
  }
  if (combined.includes('delete')) return 'Delete the current item after confirmation.';
  if (combined.includes('rename') || combined.includes('name input') || combined.includes('name')) {
    return 'Edit or commit the item name.';
  }
  if (combined.includes('reference')) return 'Add, remove, or inspect the reference image.';
  if (combined.includes('comment')) return 'Add, remove, or switch comment details.';
  if (combined.includes('annotation')) return 'Add, remove, or inspect annotation details.';
  if (combined.includes('select')) return 'Toggle selection for the current scope.';
  if (combined.includes('confirm')) return 'Confirm the current action.';
  if (combined.includes('remove')) {
    return 'Close or dismiss the current surface.';
  }

  if (events.includes('onSubmit')) return 'Submit the current form.';
  if (events.includes('onChange')) return 'Update the current control value.';
  if (events.includes('onKeyDown')) return 'Handle keyboard interaction for the current control.';
  if (events.includes('onClick') || tagName === 'button') return 'Trigger the current control action.';

  return 'Trigger the current control action.';
}

function collectAncestorClassNames(astPath) {
  const classNames = [];
  let current = astPath.parentPath;

  while (current) {
    if (current.node.type === 'JSXElement') {
      const classNameAttribute = current.node.openingElement.attributes.find((attribute) => (
        attribute.type === 'JSXAttribute' && getJsxName(attribute.name) === 'className'
      ));

      if (classNameAttribute && classNameAttribute.type === 'JSXAttribute') {
        const value = getStaticAttributeValue(classNameAttribute.value);
        if (value) classNames.push(value);
      }
    }

    current = current.parentPath;
  }

  return classNames;
}

function deriveLabelFromHandlers(attributes) {
  const handlerText = TARGET_EVENTS
    .map((eventName) => attributes[eventName]?.expression_source ?? '')
    .join(' ')
    .toLowerCase();

  if (!handlerText) return '';
  if (handlerText.includes('stoppropagation')) return 'Prevent overlay dismissal';
  if (handlerText.includes('setbulkaction(null)')) return 'Dismiss bulk action modal';
  if (handlerText.includes('setshowlightbox(true)')) return 'Open lightbox';
  if (handlerText.includes('setshowref(')) return 'Toggle reference preview';
  if (handlerText.includes('setshowversions(')) return 'Toggle version history';
  if (handlerText.includes('ontoggleselect') || handlerText.includes('toggleselect')) return 'Toggle selection';
  if (handlerText.includes('onassignflow') || handlerText.includes('handlebulkassignflow')) return 'Assign flow';
  if (handlerText.includes('ondelete') || handlerText.includes('requestdelete')) return 'Delete item';
  if (handlerText.includes('onrename') || handlerText.includes('commitrename') || handlerText.includes('seteditingname(true)')) return 'Edit name';
  if (handlerText.includes('onchangegroup') || handlerText.includes('commitgroup')) return 'Change group';
  if (handlerText.includes('setbulkgroupvalue')) return 'Change group';
  if (handlerText.includes('onplatformchange')) return 'Change platform';
  if (handlerText.includes('setpanel(')) return 'Switch detail tab';
  if (handlerText.includes('setactiveid(')) return 'Select gallery item';
  if (handlerText.includes('onupload') || handlerText.includes('handlequickupload')) return 'Upload files';
  if (handlerText.includes('setisflowsheetexpanded') || handlerText.includes('onmobileexpandedchange')) return 'Toggle flow sheet';
  if (handlerText.includes('setfilter') || handlerText.includes('onfilter')) return 'Change filter';
  if (handlerText.includes('onsearchchange')) return 'Change search';
  if (handlerText.includes('selectallvisible')) return 'Select visible items';
  if (handlerText.includes('onclose') || handlerText.includes('setshow') || handlerText.includes('null')) return 'Dismiss current surface';

  return '';
}

function isContainerLikeTag(tagName) {
  return new Set(['div', 'section', 'main', 'aside', 'article']).has(tagName);
}

function isTextDrivenTag(tagName) {
  return new Set(['button', 'label', 'a', 'span']).has(tagName);
}

function buildFeatureId(component, filePath, line, action, tagName) {
  const basis = `${component}-${path.basename(filePath, path.extname(filePath))}-${line}-${action || tagName}`;
  return slugify(basis);
}

function renderMarkdown(payload) {
  const lines = [
    '# Catalogue Action Inventory',
    '',
    `Generated: ${payload.generated_at}`,
    '',
    `Scanned files: ${payload.scanned_files.length}`,
    '',
    `Detected actions: ${payload.total_features}`,
    '',
    '| Feature ID | Component | Source | Action | Surface | Expected Outcome | Selector Hint | Viewport Coverage |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const item of payload.items) {
    lines.push([
      escapeMarkdownTableCell(item.feature_id),
      escapeMarkdownTableCell(item.component),
      escapeMarkdownTableCell(item.source),
      escapeMarkdownTableCell(item.action),
      escapeMarkdownTableCell(item.surface),
      escapeMarkdownTableCell(item.expected_outcome),
      escapeMarkdownTableCell(item.selector_hint),
      escapeMarkdownTableCell(item.viewport_coverage.join(', ')),
    ].join(' | ').replace(/^/, '| ').concat(' |'));
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function getJsxName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${getJsxName(node.object)}.${getJsxName(node.property)}`;
  if (node.type === 'JSXNamespacedName') return `${getJsxName(node.namespace)}:${getJsxName(node.name)}`;
  return '';
}

function isPascalCase(value) {
  return Boolean(value) && /^[A-Z][A-Za-z0-9]*$/.test(value);
}

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function humanizeTagName(tagName) {
  return normalizeWhitespace(
    tagName
      .replace(/[.:]/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
  );
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function escapeSelectorToken(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function escapeMarkdownTableCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .trim();
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : 'Unknown error';
  console.error(message);
  process.exitCode = 1;
}
