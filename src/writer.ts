import * as fs from 'fs';
import * as path from 'path';
import { ExtractedString, ScanOptions } from './types';

/**
 * Build a nested JSON object from extracted strings.
 *
 * Keys like "home_screen.welcome_back" become:
 * { "home_screen": { "welcome_back": "Welcome back" } }
 *
 * Keys are sorted alphabetically within each namespace.
 */
function buildNestedJson(extracted: ExtractedString[]): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};

  for (const item of extracted) {
    const dotIndex = item.key.indexOf('.');
    if (dotIndex === -1) {
      // Fallback: use the whole key as namespace with 'default' sub-key
      if (!result[item.key]) result[item.key] = {};
      result[item.key]['default'] = item.raw;
      continue;
    }

    const namespace = item.key.substring(0, dotIndex);
    const subKey = item.key.substring(dotIndex + 1);

    if (!result[namespace]) result[namespace] = {};
    result[namespace][subKey] = item.raw;
  }

  // Sort keys alphabetically within each namespace
  const sorted: Record<string, Record<string, string>> = {};
  const sortedNamespaces = Object.keys(result).sort();

  for (const ns of sortedNamespaces) {
    sorted[ns] = {};
    const sortedKeys = Object.keys(result[ns]).sort();
    for (const key of sortedKeys) {
      sorted[ns][key] = result[ns][key];
    }
  }

  return sorted;
}

/**
 * Build a source location map file.
 *
 * Format: { "home_screen.welcome_back": { "file": "src/screens/HomeScreen.tsx", "line": 42 } }
 */
function buildSourceMap(
  extracted: ExtractedString[],
  basePath: string
): Record<string, { file: string; line: number }> {
  const map: Record<string, { file: string; line: number }> = {};

  for (const item of extracted) {
    map[item.key] = {
      file: path.relative(basePath, item.filePath),
      line: item.line,
    };
  }

  return map;
}

/**
 * Write extracted strings to the output JSON file.
 *
 * - If the file exists and --overwrite is NOT set: merge new keys, preserve existing
 * - If --overwrite IS set: replace entire file
 * - Always sort keys alphabetically within each namespace
 *
 * @param extracted - Array of extracted strings
 * @param options - Scan options
 */
export function writeOutput(extracted: ExtractedString[], options: ScanOptions): void {
  const outputPath = path.resolve(options.output);
  const outputDir = path.dirname(outputPath);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const newData = buildNestedJson(extracted);

  let finalData: Record<string, Record<string, string>>;

  if (!options.overwrite && fs.existsSync(outputPath)) {
    // Merge: read existing, add new keys, preserve existing values
    try {
      const existingContent = fs.readFileSync(outputPath, 'utf-8');
      const existingData = JSON.parse(existingContent) as Record<string, Record<string, string>>;

      finalData = { ...existingData };

      for (const [namespace, keys] of Object.entries(newData)) {
        if (!finalData[namespace]) {
          finalData[namespace] = {};
        }
        for (const [key, value] of Object.entries(keys)) {
          // Only add if key doesn't already exist (preserve existing translations)
          if (!(key in finalData[namespace])) {
            finalData[namespace][key] = value;
          }
        }
      }

      // Re-sort after merge
      const sorted: Record<string, Record<string, string>> = {};
      for (const ns of Object.keys(finalData).sort()) {
        sorted[ns] = {};
        for (const key of Object.keys(finalData[ns]).sort()) {
          sorted[ns][key] = finalData[ns][key];
        }
      }
      finalData = sorted;
    } catch {
      // If existing file is invalid JSON, overwrite it
      finalData = newData;
    }
  } else {
    finalData = newData;
  }

  fs.writeFileSync(outputPath, JSON.stringify(finalData, null, 2) + '\n', 'utf-8');

  // Write source map file (unless --no-comments)
  if (!options.noComments) {
    const mapPath = outputPath + '.map';
    const sourceMap = buildSourceMap(extracted, process.cwd());
    fs.writeFileSync(mapPath, JSON.stringify(sourceMap, null, 2) + '\n', 'utf-8');
  }
}
