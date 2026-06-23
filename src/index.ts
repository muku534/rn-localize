#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { ScanOptions } from './types';
import { scanDirectory } from './scanner';
import { writeOutput } from './writer';
import { printReport, confirmRewrite } from './reporter';
import { rewriteFiles } from './rewriter';

const program = new Command();

program
  .name('rn-localize')
  .description('Auto-extract hardcoded strings from React Native projects for localization')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan source files and extract hardcoded strings for localization')
  .option('-s, --src <path>', 'Source directory to scan', './src')
  .option('-o, --output <path>', 'Output file path', './i18n/en.json')
  .option('-l, --lang <code>', 'Language code for output file', 'en')
  .option('--rewrite', 'Rewrite source files with t() calls', false)
  .option(
    '--import <statement>',
    'Import line to inject when rewriting',
    "import { t } from '../i18n'"
  )
  .option(
    '--ignore <patterns>',
    'Comma-separated glob patterns to ignore',
    'node_modules,**/*.test.*,**/*.spec.*'
  )
  .option('--dry-run', 'Preview output without writing any files', false)
  .option('--no-comments', 'Omit source location comments from output JSON')
  .option('--prefix <name>', 'Manually set key prefix for all keys')
  .option('--min-length <n>', 'Minimum string length to extract', '2')
  .option('--overwrite', 'Overwrite existing keys in output file instead of merging', false)
  .action(async (cmdOptions) => {
    const options: ScanOptions = {
      src: cmdOptions.src,
      output: cmdOptions.output,
      lang: cmdOptions.lang,
      rewrite: cmdOptions.rewrite,
      importStatement: cmdOptions.import,
      ignore: cmdOptions.ignore.split(',').map((p: string) => p.trim()),
      dryRun: cmdOptions.dryRun,
      noComments: !cmdOptions.comments, // commander negates --no-comments to .comments = false
      prefix: cmdOptions.prefix,
      minLength: parseInt(cmdOptions.minLength, 10),
      overwrite: cmdOptions.overwrite,
    };

    const spinner = ora('Scanning files...').start();

    try {
      const result = await scanDirectory(options);

      spinner.succeed(`Scanned ${result.fileCount} files`);

      if (result.extracted.length === 0) {
        console.log('');
        console.log(chalk.yellow('No hardcoded strings found.'));
        console.log('');
        return;
      }

      // Print report
      printReport(result, options);

      // Write output (unless dry run)
      if (!options.dryRun) {
        writeOutput(result.extracted, options);
      }

      // Rewrite source files (if requested)
      if (options.rewrite && !options.dryRun) {
        const confirmed = await confirmRewrite(result.extracted);

        if (confirmed) {
          const rewriteSpinner = ora('Rewriting source files...').start();
          rewriteFiles(result.extracted, options);
          rewriteSpinner.succeed('Source files rewritten with t() calls');
        } else {
          console.log(chalk.yellow('Rewrite cancelled.'));
        }
      }
    } catch (err) {
      spinner.fail('Scan failed');
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Error: ${message}`));
      process.exit(1);
    }
  });

program.parse();
