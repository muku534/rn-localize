import * as fs from 'fs';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { ExtractedString, ScanOptions } from './types';
import { generateKey, KeyCollisionTracker } from './keyGenerator';

/**
 * Props that should never be extracted for localization.
 * These are structural/functional props, not user-facing text.
 */
const SKIP_PROPS = new Set([
  'testID',
  'key',
  'ref',
  'style',
  'className',
  'id',
  'source',
  'name',
  'type',
  'pointerEvents',
  'collapsable',
]);

/**
 * Patterns for strings that should never be extracted.
 */
const SKIP_PATTERNS: RegExp[] = [
  /^https?:\/\//,           // URLs
  /^\d+$/,                  // Pure numbers
  /^#[0-9a-fA-F]{3,8}$/,   // Hex colors
  /^\s*$/,                  // Whitespace only
  /^[a-z_]+\.[a-z_]+$/,    // Looks like a key already (home.title)
  /^[A-Z_]+$/,              // Constants like SCREEN_NAME
  /^[a-z0-9\-]+$/,          // Technical strings (e.g. 'window', 'dark-content', 'object', 'center')
];

/**
 * Check if a string matches any skip pattern.
 */
function shouldSkipString(value: string, minLength: number): boolean {
  if (value.trim().length < minLength) return true;
  return SKIP_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

/**
 * Check if a node is inside a StyleSheet.create() call.
 */
function isInsideStyleSheet(path: NodePath): boolean {
  let current: NodePath | null = path;
  while (current) {
    if (
      current.isCallExpression() &&
      current.node.callee &&
      t.isMemberExpression(current.node.callee) &&
      t.isIdentifier(current.node.callee.object) &&
      current.node.callee.object.name === 'StyleSheet' &&
      t.isIdentifier(current.node.callee.property) &&
      current.node.callee.property.name === 'create'
    ) {
      return true;
    }
    current = current.parentPath;
  }
  return false;
}

/**
 * Check if a string is already wrapped in a t() call.
 */
function isInsideTCall(path: NodePath): boolean {
  const parent = path.parentPath;
  if (!parent) return false;

  if (
    parent.isCallExpression() &&
    t.isIdentifier(parent.node.callee) &&
    parent.node.callee.name === 't'
  ) {
    return true;
  }

  return false;
}

/**
 * Parse a single file and extract all localizable strings.
 *
 * @param filePath - Absolute path to the source file
 * @param options - Scan options
 * @returns Array of extracted strings and count of skipped (already-localized) strings
 */
export function parseFile(
  filePath: string,
  options: Pick<ScanOptions, 'minLength' | 'prefix'>
): { extracted: ExtractedString[]; skippedCount: number } {
  const code = fs.readFileSync(filePath, 'utf-8');
  const extracted: ExtractedString[] = [];
  let skippedCount = 0;
  const collisionTracker = new KeyCollisionTracker();

  let ast: ReturnType<typeof babelParser.parse>;
  try {
    ast = babelParser.parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'optionalChaining',
        'nullishCoalescingOperator',
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`⚠ Skipping ${filePath}: Parse error — ${message}`);
    return { extracted: [], skippedCount: 0 };
  }

  traverse(ast, {
    /**
     * A) JSX text nodes — <Text>Welcome back</Text>
     */
    JSXText(path: NodePath<t.JSXText>) {
      const value = path.node.value.trim().replace(/\s+/g, ' ');

      if (!value || /^\s*$/.test(value)) return;
      if (isInsideStyleSheet(path)) return;

      if (shouldSkipString(value, options.minLength)) return;

      const key = collisionTracker.resolve(
        generateKey(value, filePath, options.prefix),
        value
      );

      extracted.push({
        raw: value,
        key,
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
        type: 'jsx_text',
      });
    },

    /**
     * B) String literal props on JSX elements
     *    <TextInput placeholder="Search here..." />
     */
    JSXAttribute(path: NodePath<t.JSXAttribute>) {
      const propName = t.isJSXIdentifier(path.node.name)
        ? path.node.name.name
        : undefined;

      if (!propName) return;
      if (SKIP_PROPS.has(propName)) return;

      const value = path.node.value;
      if (!t.isStringLiteral(value)) return;

      const raw = value.value;
      if (shouldSkipString(raw, options.minLength)) return;
      if (isInsideStyleSheet(path)) return;

      const key = collisionTracker.resolve(
        generateKey(raw, filePath, options.prefix),
        raw
      );

      extracted.push({
        raw,
        key,
        filePath,
        line: value.loc?.start.line ?? 0,
        column: value.loc?.start.column ?? 0,
        type: 'string_prop',
        propName,
      });
    },

    /**
     * C) Static template literals (zero expressions)
     *    const msg = `Welcome to the app`
     */
    TemplateLiteral(path: NodePath<t.TemplateLiteral>) {
      // Skip template literals with expressions
      if (path.node.expressions.length > 0) return;

      // Must have exactly one quasi
      if (path.node.quasis.length !== 1) return;

      const raw = path.node.quasis[0].value.cooked ?? path.node.quasis[0].value.raw;
      if (shouldSkipString(raw, options.minLength)) return;
      if (isInsideStyleSheet(path)) return;
      if (isInsideTCall(path)) {
        skippedCount++;
        return;
      }

      const key = collisionTracker.resolve(
        generateKey(raw, filePath, options.prefix),
        raw
      );

      extracted.push({
        raw,
        key,
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
        type: 'template_literal',
      });
    },

    StringLiteral(path: NodePath<t.StringLiteral>) {
      if (isInsideTCall(path)) {
        skippedCount++;
        return;
      }

      // Skip if parent is JSXAttribute (handled by JSXAttribute visitor)
      if (path.parentPath.isJSXAttribute()) return;

      // Skip import/export declarations
      if (path.parentPath.isImportDeclaration() || path.parentPath.isExportDeclaration()) return;
      
      // Skip ObjectMethod keys
      if (path.parentPath.isObjectMethod() && path.parentPath.node.key === path.node) return;

      // Skip object properties where the string is the KEY
      if (path.parentPath.isObjectProperty() && path.parentPath.node.key === path.node) return;

      // Skip require() calls
      if (
        path.parentPath.isCallExpression() &&
        t.isIdentifier(path.parentPath.node.callee) &&
        path.parentPath.node.callee.name === 'require'
      ) return;

      const raw = path.node.value;
      if (shouldSkipString(raw, options.minLength)) return;
      if (isInsideStyleSheet(path)) return;

      const key = collisionTracker.resolve(
        generateKey(raw, filePath, options.prefix),
        raw
      );

      extracted.push({
        raw,
        key,
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
        type: 'string_literal',
      });
    },
  });

  return { extracted, skippedCount };
}
