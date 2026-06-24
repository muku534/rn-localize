import * as fs from 'fs';
import * as path from 'path';
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { ExtractedString, ScanOptions } from './types';

/**
 * Rewrite source files to replace hardcoded strings with t('key') calls.
 *
 * Strategy: Parse the file once, collect all AST node replacements,
 * and apply them together via @babel/generator in a single pass.
 * This avoids the problem of node positions shifting with sequential replacements.
 *
 * @param extracted - Extracted strings grouped by file
 * @param options - Scan options (importStatement, src path)
 */
export function rewriteFiles(extracted: ExtractedString[], options: ScanOptions): void {
  // Group extracted strings by file
  const fileGroups = new Map<string, ExtractedString[]>();
  for (const item of extracted) {
    const group = fileGroups.get(item.filePath) ?? [];
    group.push(item);
    fileGroups.set(item.filePath, group);
  }

  for (const [filePath, strings] of fileGroups) {
    rewriteSingleFile(filePath, strings, options);
  }
}

/**
 * Rewrite a single source file, replacing all hardcoded strings with t() calls
 * in a single AST pass.
 */
function rewriteSingleFile(
  filePath: string,
  strings: ExtractedString[],
  options: ScanOptions
): void {
  const code = fs.readFileSync(filePath, 'utf-8');

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
    console.warn(`⚠ Skipping rewrite for ${filePath}: Parse error — ${message}`);
    return;
  }

  // Build a lookup of strings to replace, keyed by line:column for precise matching
  const replacementMap = new Map<string, ExtractedString>();
  for (const str of strings) {
    const locationKey = `${str.line}:${str.column}`;
    replacementMap.set(locationKey, str);
  }

  let hasReplacements = false;
  let hasExistingImport = false;

  // Check if the t import already exists
  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value;
      // Check if this import matches the configured import statement
      if (options.importStatement.includes(source)) {
        const specifiers = path.node.specifiers;
        for (const spec of specifiers) {
          if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported) && spec.imported.name === 't') {
            hasExistingImport = true;
          }
        }
      }
    },
  });

  // Single pass: traverse AST and replace all matching nodes
  traverse(ast, {
    /**
     * A) JSX text nodes → {t('key')}
     */
    JSXText(path) {
      const loc = path.node.loc;
      if (!loc) return;

      const value = path.node.value.trim().replace(/\s+/g, ' ');
      if (!value) return;

      const locationKey = `${loc.start.line}:${loc.start.column}`;
      const match = replacementMap.get(locationKey);
      if (!match || match.type !== 'jsx_text') return;

      // Replace JSXText with JSXExpressionContainer containing t('key')
      const tCall = t.callExpression(t.identifier('t'), [t.stringLiteral(match.key)]);
      const jsxExpression = t.jsxExpressionContainer(tCall);
      path.replaceWith(jsxExpression);
      hasReplacements = true;
    },

    /**
     * B) String literal props → {t('key')}
     */
    JSXAttribute(path) {
      const value = path.node.value;
      if (!t.isStringLiteral(value)) return;

      const loc = value.loc;
      if (!loc) return;

      const locationKey = `${loc.start.line}:${loc.start.column}`;
      const match = replacementMap.get(locationKey);
      if (!match || match.type !== 'string_prop') return;

      // Replace StringLiteral with JSXExpressionContainer containing t('key')
      const tCall = t.callExpression(t.identifier('t'), [t.stringLiteral(match.key)]);
      const jsxExpression = t.jsxExpressionContainer(tCall);
      path.node.value = jsxExpression;
      hasReplacements = true;
    },

    /**
     * C) Static template literals → t('key')
     */
    TemplateLiteral(path) {
      const loc = path.node.loc;
      if (!loc) return;

      if (path.node.expressions.length > 0) return;

      const locationKey = `${loc.start.line}:${loc.start.column}`;
      const match = replacementMap.get(locationKey);
      if (!match || match.type !== 'template_literal') return;

      // Replace TemplateLiteral with t('key') call
      const tCall = t.callExpression(t.identifier('t'), [t.stringLiteral(match.key)]);
      path.replaceWith(tCall);
      hasReplacements = true;
    },

    /**
     * D) Bare String literals → t('key')
     */
    StringLiteral(path) {
      const loc = path.node.loc;
      if (!loc) return;

      const locationKey = `${loc.start.line}:${loc.start.column}`;
      const match = replacementMap.get(locationKey);
      if (!match || match.type !== 'string_literal') return;

      // Replace StringLiteral with t('key') call
      const tCall = t.callExpression(t.identifier('t'), [t.stringLiteral(match.key)]);
      path.replaceWith(tCall);
      hasReplacements = true;
    },
  });

  if (!hasReplacements) return;

  // Inject import if needed
  if (!hasExistingImport) {
    injectImport(ast, filePath, options);
  }

  // Generate the modified code from the AST in a single pass
  const output = generate(ast, {
    retainLines: true,
    retainFunctionParens: true,
    jsescOption: { minimal: true },
  });

  fs.writeFileSync(filePath, output.code, 'utf-8');
}

/**
 * Inject the t() import statement at the top of the file,
 * after the last existing import statement.
 */
function injectImport(
  ast: ReturnType<typeof babelParser.parse>,
  filePath: string,
  options: ScanOptions
): void {
  // Parse the import statement to get an AST node
  const importStatement = options.importStatement;

  let importAst: ReturnType<typeof babelParser.parse>;
  try {
    importAst = babelParser.parse(importStatement + ';', {
      sourceType: 'module',
      plugins: ['typescript'],
    });
  } catch {
    // Fallback: build the import node manually
    const importNode = t.importDeclaration(
      [t.importSpecifier(t.identifier('t'), t.identifier('t'))],
      t.stringLiteral(computeImportPath(filePath, options.src))
    );
    insertImportNode(ast, importNode);
    return;
  }

  const importNode = importAst.program.body[0];
  if (t.isImportDeclaration(importNode)) {
    insertImportNode(ast, importNode);
  }
}

/**
 * Insert an import declaration after the last existing import in the program body.
 */
function insertImportNode(
  ast: ReturnType<typeof babelParser.parse>,
  importNode: t.ImportDeclaration
): void {
  const body = ast.program.body;
  let lastImportIndex = -1;

  for (let i = 0; i < body.length; i++) {
    if (t.isImportDeclaration(body[i])) {
      lastImportIndex = i;
    }
  }

  body.splice(lastImportIndex + 1, 0, importNode);
}

/**
 * Compute the relative import path for the i18n module
 * based on the file's depth relative to the src directory.
 */
function computeImportPath(filePath: string, srcDir: string): string {
  const srcPath = path.resolve(srcDir);
  const fileDir = path.dirname(filePath);
  const relativePath = path.relative(fileDir, srcPath);

  // Default: point to an 'i18n' module in the src root
  return path.posix.join(
    relativePath.split(path.sep).join(path.posix.sep) || '.',
    'i18n'
  );
}
