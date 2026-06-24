# rn-localize

> Auto-extract hardcoded strings from React Native projects for localization.

`rn-localize` scans your React Native codebase, extracts all hardcoded strings from JSX/TSX/JS/TS files using AST parsing, generates human-readable translation keys, and writes an `en.json` localization file. It can also optionally rewrite your source files to replace hardcoded strings with `t('key')` calls.

## Installation

```bash
# Run directly with npx (no install needed)
npx rn-localize scan

# Or install globally
npm install -g rn-localize

# Or install locally in your project
npm install --save-dev rn-localize
```

## Usage

### Basic Scan

```bash
# Scan ./src and write to ./i18n/en.json
npx rn-localize scan

# Scan a custom directory
npx rn-localize scan --src ./app

# Dry run — preview without writing files
npx rn-localize scan --src ./app --dry-run
```

### Rewrite Mode

Automatically replace hardcoded strings with `t()` calls:

```bash
# Full rewrite mode
npx rn-localize scan --src ./src --rewrite --output ./locales/en.json

# Custom i18n import
npx rn-localize scan --rewrite --import "import i18n from '@/utils/i18n'"
```

### All Options

| Option | Default | Description |
|---|---|---|
| `-s, --src <path>` | `./src` | Source directory to scan |
| `-o, --output <path>` | `./i18n/en.json` | Output file path |
| `-l, --lang <code>` | `en` | Language code for output file |
| `--rewrite` | `false` | Rewrite source files with `t()` calls |
| `--import <statement>` | `import { t } from '../i18n'` | Import line to inject when rewriting |
| `--ignore <patterns>` | `node_modules,**/*.test.*,**/*.spec.*` | Comma-separated glob patterns to ignore |
| `--dry-run` | `false` | Preview output without writing any files |
| `--no-map` | `false` | Omit source location map file |
| `--prefix <name>` | (auto from filename) | Manually set key prefix for all keys |
| `--min-length <n>` | `2` | Minimum string length to extract |
| `--overwrite` | `false` | Overwrite existing keys instead of merging |

## Output Format

### Translation File (`en.json`)

```json
{
  "home_screen": {
    "already_have_an_account": "Already have an account?",
    "get_started": "Get Started",
    "good_morning_hope_you_have_a_great_day": "Good morning! Hope you have a great day.",
    "search_here": "Search here...",
    "welcome_back": "Welcome back"
  },
  "profile_screen": {
    "edit_profile": "Edit Profile",
    "submit": "Submit"
  }
}
```

### Source Map File (`en.json.map`)

A parallel file with source locations for each key:

```json
{
  "home_screen.welcome_back": {
    "file": "src/screens/HomeScreen.tsx",
    "line": 42
  }
}
```

## What Gets Extracted

| AST Node | Example | Extracted? |
|---|---|---|
| JSX text | `<Text>Welcome</Text>` | ✅ |
| String props | `<Input placeholder="Search" />` | ✅ |
| Static template literals | `` const msg = `Hello` `` | ✅ |
| Props: testID, key, style, etc. | `<View testID="btn" />` | ❌ Skipped |
| URLs | `https://example.com` | ❌ Skipped |
| Hex colors | `#FF0000` | ❌ Skipped |
| Already wrapped in `t()` | `t('key')` | ❌ Skipped |
| Inside `StyleSheet.create()` | Style values | ❌ Skipped |
| Template literals with expressions | `` `Hello ${name}` `` | ❌ Skipped |

## Key Generation

Keys are generated from the filename and string content:

```
{screen_name}.{string_slug}

HomeScreen.tsx + "Welcome back" → home_screen.welcome_back
ProfileScreen.tsx + "Submit"    → profile_screen.submit
```

Collision handling: if two different strings produce the same key, suffixes `_2`, `_3` are appended.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run locally
npm run dev -- scan --src ./tests/fixtures --dry-run
```

## License

MIT
