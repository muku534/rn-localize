import * as fs from 'fs';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { ExtractedString, ScanOptions } from './types';
import { generateKey, KeyCollisionTracker } from './keyGenerator';

/**
 * Props that are allowed to be extracted for localization.
 */
const ALLOWED_PROPS = new Set([
  'placeholder',
  'title',
  'label',
  'text',
  'subtitle',
  'message',
  'description',
  'header',
  'footer',
  'caption',
  'tooltip',
  'alt'
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

  // Helper to extract a single string value safely
  const extractValue = (
    raw: string,
    loc: t.SourceLocation | null | undefined,
    type: ExtractedString['type'],
    propName?: string
  ) => {
    if (!loc) return;
    if (shouldSkipString(raw, options.minLength)) return;

    const key = collisionTracker.resolve(
      generateKey(raw, filePath, options.prefix),
      raw
    );

    extracted.push({
      raw,
      key,
      filePath,
      line: loc.start.line,
      column: loc.start.column,
      type,
      propName,
    });
  };

  traverse(ast, {
    /**
     * A) JSX text nodes — <Text>Welcome back</Text>
     */
    JSXText(path: NodePath<t.JSXText>) {
      const value = path.node.value.trim().replace(/\s+/g, ' ');

      if (!value || /^\s*$/.test(value)) return;
      if (isInsideStyleSheet(path)) return;

      extractValue(value, path.node.loc, 'jsx_text');
    },

    /**
     * B) String literal props on JSX elements (Allowed props only!)
     *    <TextInput placeholder="Search here..." />
     */
    JSXAttribute(path: NodePath<t.JSXAttribute>) {
      const propName = t.isJSXIdentifier(path.node.name)
        ? path.node.name.name
        : undefined;

      if (!propName) return;
      if (!ALLOWED_PROPS.has(propName)) return;

      const value = path.node.value;
      if (!t.isStringLiteral(value)) return;

      if (isInsideStyleSheet(path)) return;

      extractValue(value.value, value.loc, 'string_prop', propName);
    },

    /**
     * C) Safely target specific JS function calls like Alert.alert or Toast.show
     */
    CallExpression(path: NodePath<t.CallExpression>) {
      const callee = path.node.callee;

      // 1. Alert.alert("Title", "Message")
      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.object) &&
        callee.object.name === 'Alert' &&
        t.isIdentifier(callee.property) &&
        callee.property.name === 'alert'
      ) {
        const args = path.node.arguments;
        for (let i = 0; i < Math.min(2, args.length); i++) {
          const arg = args[i];
          if (t.isStringLiteral(arg)) {
            if (isInsideTCall(path.get(`arguments.${i}`) as NodePath)) {
              skippedCount++;
            } else {
              extractValue(arg.value, arg.loc, 'string_literal');
            }
          } else if (t.isTemplateLiteral(arg) && arg.expressions.length === 0 && arg.quasis.length === 1) {
            if (isInsideTCall(path.get(`arguments.${i}`) as NodePath)) {
              skippedCount++;
            } else {
              const raw = arg.quasis[0].value.cooked ?? arg.quasis[0].value.raw;
              extractValue(raw, arg.loc, 'template_literal');
            }
          }
        }
      }

      // 2. Toast.show({ text1: "Hello", text2: "World" })
      if (
        t.isMemberExpression(callee) &&
        t.isIdentifier(callee.object) &&
        callee.object.name === 'Toast' &&
        t.isIdentifier(callee.property) &&
        callee.property.name === 'show'
      ) {
        const args = path.node.arguments;
        if (args.length > 0 && t.isObjectExpression(args[0])) {
          const objPath = path.get('arguments.0') as NodePath<t.ObjectExpression>;
          for (let i = 0; i < args[0].properties.length; i++) {
            const prop = args[0].properties[i];
            if (
              t.isObjectProperty(prop) &&
              t.isIdentifier(prop.key) &&
              (prop.key.name === 'text1' || prop.key.name === 'text2')
            ) {
              if (t.isStringLiteral(prop.value)) {
                if (isInsideTCall(objPath.get(`properties.${i}.value`) as NodePath)) {
                  skippedCount++;
                } else {
                  extractValue(prop.value.value, prop.value.loc, 'string_literal');
                }
              } else if (t.isTemplateLiteral(prop.value) && prop.value.expressions.length === 0 && prop.value.quasis.length === 1) {
                if (isInsideTCall(objPath.get(`properties.${i}.value`) as NodePath)) {
                  skippedCount++;
                } else {
                  const raw = prop.value.quasis[0].value.cooked ?? prop.value.quasis[0].value.raw;
                  extractValue(raw, prop.value.loc, 'template_literal');
                }
              }
            }
          }
        }
      }
    }
  });

  return { extracted, skippedCount };
}
