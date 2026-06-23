import * as path from 'path';

/**
 * Tracks generated keys to handle collisions within the same run.
 * If two different strings produce the same key, appends _2, _3, etc.
 */
export class KeyCollisionTracker {
  private keyCounts: Map<string, number> = new Map();
  private keyToRaw: Map<string, string> = new Map();

  /**
   * Register a key and return the final (possibly suffixed) key.
   * If the same raw string produces the same key, reuse it (dedup within same screen).
   * If a different raw string collides, append a numeric suffix.
   */
  resolve(key: string, raw: string): string {
    const existingRaw = this.keyToRaw.get(key);

    // Same raw string → reuse the same key (no collision)
    if (existingRaw === raw) {
      return key;
    }

    // Key not yet used → register it
    if (!this.keyCounts.has(key)) {
      this.keyCounts.set(key, 1);
      this.keyToRaw.set(key, raw);
      return key;
    }

    // Collision: different raw string produced the same key
    const count = this.keyCounts.get(key)! + 1;
    this.keyCounts.set(key, count);
    const suffixedKey = `${key}_${count}`;
    this.keyToRaw.set(suffixedKey, raw);
    return suffixedKey;
  }

  /** Reset tracker (e.g. between files if desired) */
  reset(): void {
    this.keyCounts.clear();
    this.keyToRaw.clear();
  }
}

/**
 * Convert a string to snake_case.
 * "HomeScreen" → "home_screen"
 * "ProfileScreen" → "profile_screen"
 * "MyComponent" → "my_component"
 */
export function toSnakeCase(str: string): string {
  return str
    // Insert underscore before uppercase letters that follow lowercase letters
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    // Insert underscore before uppercase letters that are followed by lowercase letters
    // (handles sequences like "HTMLParser" → "html_parser")
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Slugify a raw string into a valid i18n key segment.
 * "Welcome back!" → "welcome_back"
 * "Good morning 🌞" → "good_morning"
 */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')   // strip non-alphanumeric
    .trim()
    .replace(/\s+/g, '_')          // spaces to underscores
    .slice(0, 40)                   // max 40 chars
    .replace(/_+$/, '');            // trim trailing underscores
}

/**
 * Generate an i18n key from a raw string and its file path.
 *
 * Format: {screen_name}.{string_slug}
 *
 * Examples:
 *   "Welcome back" from HomeScreen.tsx → "home_screen.welcome_back"
 *   "Submit" from ProfileScreen.tsx → "profile_screen.submit"
 *
 * @param raw - The original string value
 * @param filePath - Path to the source file
 * @param prefix - Optional manual prefix override (from --prefix flag)
 */
export function generateKey(raw: string, filePath: string, prefix?: string): string {
  // 1. Get screen name from filename
  const fileName = path.basename(filePath, path.extname(filePath));
  const screenName = prefix ?? toSnakeCase(fileName);

  // 2. Slugify the string
  const slug = slugify(raw);

  // Guard: if slug is empty after processing, use a fallback
  if (!slug) {
    return `${screenName}.untranslated`;
  }

  return `${screenName}.${slug}`;
}
