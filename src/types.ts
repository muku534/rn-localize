export interface ExtractedString {
  /** Original string value */
  raw: string;
  /** Generated i18n key e.g. "home_screen.welcome_back" */
  key: string;
  /** Absolute path to source file */
  filePath: string;
  /** Line number in source */
  line: number;
  /** Column number */
  column: number;
  /** Type of AST node the string was extracted from */
  type: 'jsx_text' | 'string_prop' | 'template_literal';
  /** Prop name if type is 'string_prop', e.g. "placeholder", "title" */
  propName?: string;
}

export interface ScanOptions {
  src: string;
  output: string;
  lang: string;
  rewrite: boolean;
  importStatement: string;
  ignore: string[];
  dryRun: boolean;
  noComments: boolean;
  prefix?: string;
  minLength: number;
  overwrite: boolean;
}

export interface ScanResult {
  extracted: ExtractedString[];
  fileCount: number;
  /** Count of strings already wrapped in t() calls */
  skippedCount: number;
}
