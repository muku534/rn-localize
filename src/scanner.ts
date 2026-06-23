import * as path from 'path';
import fg from 'fast-glob';
import { ScanOptions, ScanResult, ExtractedString } from './types';
import { parseFile } from './parser';

/**
 * Scan a directory for all JS/JSX/TS/TSX files and extract localizable strings.
 *
 * @param options - Scan options including src directory, ignore patterns, etc.
 * @returns ScanResult with all extracted strings, file count, and skipped count.
 */
export async function scanDirectory(options: ScanOptions): Promise<ScanResult> {
  const srcPath = path.resolve(options.src);

  // Find all source files
  const files = await fg('**/*.{js,jsx,ts,tsx}', {
    cwd: srcPath,
    ignore: options.ignore,
    absolute: false,
  });

  const allExtracted: ExtractedString[] = [];
  let totalSkipped = 0;

  for (const file of files) {
    const absolutePath = path.join(srcPath, file);
    const { extracted, skippedCount } = parseFile(absolutePath, {
      minLength: options.minLength,
      prefix: options.prefix,
    });

    allExtracted.push(...extracted);
    totalSkipped += skippedCount;
  }

  return {
    extracted: allExtracted,
    fileCount: files.length,
    skippedCount: totalSkipped,
  };
}
