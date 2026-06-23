import chalk from 'chalk';
import { ExtractedString, ScanResult, ScanOptions } from './types';
import * as path from 'path';

/**
 * Get unique screen names from extracted strings.
 */
function getScreenCounts(extracted: ExtractedString[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of extracted) {
    const fileName = path.basename(item.filePath, path.extname(item.filePath));
    counts.set(fileName, (counts.get(fileName) ?? 0) + 1);
  }

  return counts;
}

/**
 * Draw an ASCII table of screen names and string counts.
 */
function drawTable(screenCounts: Map<string, number>): string {
  const entries = Array.from(screenCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxNameLen = Math.max(
    'Screen'.length,
    ...entries.map(([name]) => name.length)
  );
  const maxCountLen = Math.max(
    'Strings'.length,
    ...entries.map(([, count]) => String(count).length)
  );

  const pad = (str: string, len: number) => str + ' '.repeat(Math.max(0, len - str.length));
  const padRight = (str: string, len: number) => ' '.repeat(Math.max(0, len - str.length)) + str;

  const lines: string[] = [];

  // Top border
  lines.push(`┌─${'─'.repeat(maxNameLen)}─┬─${'─'.repeat(maxCountLen)}─┐`);
  // Header
  lines.push(`│ ${pad('Screen', maxNameLen)} │ ${pad('Strings', maxCountLen)} │`);
  // Separator
  lines.push(`├─${'─'.repeat(maxNameLen)}─┼─${'─'.repeat(maxCountLen)}─┤`);
  // Rows
  for (const [name, count] of entries) {
    lines.push(`│ ${pad(name, maxNameLen)} │ ${padRight(String(count), maxCountLen)} │`);
  }
  // Bottom border
  lines.push(`└─${'─'.repeat(maxNameLen)}─┴─${'─'.repeat(maxCountLen)}─┘`);

  return lines.join('\n');
}

/**
 * Print the scan summary report to the console.
 */
export function printReport(result: ScanResult, options: ScanOptions): void {
  const { extracted, fileCount, skippedCount } = result;
  const screenCounts = getScreenCounts(extracted);

  console.log('');
  console.log(chalk.green('✓') + ` Scanned ${chalk.bold(String(fileCount))} files`);
  console.log(
    chalk.green('✓') +
      ` Extracted ${chalk.bold(String(extracted.length))} strings across ${chalk.bold(
        String(screenCounts.size)
      )} screens`
  );

  if (skippedCount > 0) {
    console.log(
      chalk.yellow('⚠') +
        ` Skipped ${chalk.bold(String(skippedCount))} strings (already wrapped in t())`
    );
  }

  console.log('');

  if (extracted.length > 0) {
    console.log(drawTable(screenCounts));
    console.log('');
  }

  if (options.dryRun) {
    console.log(chalk.cyan('Dry run — no files written.'));
    console.log('');
    // Print the full extracted JSON to stdout
    const output: Record<string, Record<string, string>> = {};
    for (const item of extracted) {
      const dotIndex = item.key.indexOf('.');
      const ns = dotIndex === -1 ? item.key : item.key.substring(0, dotIndex);
      const subKey = dotIndex === -1 ? 'default' : item.key.substring(dotIndex + 1);
      if (!output[ns]) output[ns] = {};
      output[ns][subKey] = item.raw;
    }
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`Output written to: ${chalk.bold(options.output)}`);
  }

  console.log('');
}

/**
 * Show a preview of files that will be rewritten and ask for confirmation.
 * Uses Node built-in readline for the confirmation prompt.
 *
 * @returns true if user confirms, false otherwise
 */
export async function confirmRewrite(extracted: ExtractedString[]): Promise<boolean> {
  // Get unique files
  const uniqueFiles = [...new Set(extracted.map((e) => e.filePath))];

  console.log('');
  console.log(chalk.yellow.bold('Rewrite Preview:'));
  console.log('');

  // Show first 3 files that will be changed
  const previewFiles = uniqueFiles.slice(0, 3);
  for (const file of previewFiles) {
    const fileStrings = extracted.filter((e) => e.filePath === file);
    console.log(chalk.cyan(`  ${path.relative(process.cwd(), file)}`));
    for (const str of fileStrings.slice(0, 5)) {
      console.log(
        chalk.dim(`    L${str.line}: `) +
          chalk.red(`"${str.raw}"`) +
          chalk.dim(' → ') +
          chalk.green(`t('${str.key}')`)
      );
    }
    if (fileStrings.length > 5) {
      console.log(chalk.dim(`    ... and ${fileStrings.length - 5} more`));
    }
    console.log('');
  }

  if (uniqueFiles.length > 3) {
    console.log(chalk.dim(`  ... and ${uniqueFiles.length - 3} more files`));
    console.log('');
  }

  // Ask for confirmation using Node built-in readline
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    rl.question(
      chalk.yellow(`The following ${uniqueFiles.length} files will be modified. Continue? (y/N) `),
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      }
    );
  });
}
