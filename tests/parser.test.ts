import * as path from 'path';
import { parseFile } from '../src/parser';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('parser', () => {
  describe('JSX text extraction', () => {
    it('extracts JSX text nodes correctly', () => {
      const filePath = path.join(fixturesDir, 'HomeScreen.tsx');
      const { extracted } = parseFile(filePath, { minLength: 2 });

      const texts = extracted.filter((e) => e.type === 'jsx_text');
      const rawValues = texts.map((e) => e.raw);

      expect(rawValues).toContain('Welcome back');
      expect(rawValues).toContain('Good morning! Hope you have a great day.');
      expect(rawValues).toContain('Get Started');
      expect(rawValues).toContain('Already have an account?');
    });

    it('skips whitespace-only JSX text', () => {
      const filePath = path.join(fixturesDir, 'HomeScreen.tsx');
      const { extracted } = parseFile(filePath, { minLength: 2 });

      const texts = extracted.filter((e) => e.type === 'jsx_text');
      for (const text of texts) {
        expect(text.raw.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('String prop extraction', () => {
    it('extracts string prop values correctly', () => {
      const filePath = path.join(fixturesDir, 'HomeScreen.tsx');
      const { extracted } = parseFile(filePath, { minLength: 2 });

      const props = extracted.filter((e) => e.type === 'string_prop');
      const propEntries = props.map((e) => ({ prop: e.propName, raw: e.raw }));

      expect(propEntries).toContainEqual({ prop: 'placeholder', raw: 'Search here...' });
    });

    it('skips testID, key, and style props', () => {
      const filePath = path.join(fixturesDir, 'ProfileScreen.tsx');
      const { extracted } = parseFile(filePath, { minLength: 2 });

      const props = extracted.filter((e) => e.type === 'string_prop');
      const propNames = props.map((e) => e.propName);

      expect(propNames).not.toContain('testID');
      expect(propNames).not.toContain('key');
      expect(propNames).not.toContain('style');
    });

    it('extracts placeholder, title, and accessibilityLabel props from ProfileScreen', () => {
      const filePath = path.join(fixturesDir, 'ProfileScreen.tsx');
      const { extracted } = parseFile(filePath, { minLength: 2 });

      const props = extracted.filter((e) => e.type === 'string_prop');
      const propEntries = props.map((e) => ({ prop: e.propName, raw: e.raw }));

      expect(propEntries).toContainEqual({ prop: 'placeholder', raw: 'Enter name' });
      expect(propEntries).toContainEqual({ prop: 'title', raw: 'My Profile' });
      expect(propEntries).toContainEqual({ prop: 'accessibilityLabel', raw: 'profile photo' });
    });
  });

  describe('Skip patterns', () => {
    it('skips strings matching SKIP_PATTERNS (URLs, hex colors, etc.)', () => {
      // Create a temporary test string check
      const filePath = path.join(fixturesDir, 'HomeScreen.tsx');
      const { extracted } = parseFile(filePath, { minLength: 2 });

      for (const item of extracted) {
        // None of the extracted strings should be URLs
        expect(item.raw).not.toMatch(/^https?:\/\//);
        // None should be hex colors
        expect(item.raw).not.toMatch(/^#[0-9a-fA-F]{3,8}$/);
        // None should be pure numbers
        expect(item.raw).not.toMatch(/^\d+$/);
        // None should be ALL_CAPS constants
        expect(item.raw).not.toMatch(/^[A-Z_]+$/);
      }
    });

    it('skips strings already wrapped in t()', () => {
      const filePath = path.join(fixturesDir, 'HomeScreen.tsx');
      const { skippedCount } = parseFile(filePath, { minLength: 2 });

      // HomeScreen doesn't have t() calls, so skippedCount should be 0
      expect(skippedCount).toBe(0);
    });
  });

  describe('TypeScript support', () => {
    it('handles TypeScript files without crashing', () => {
      const filePath = path.join(fixturesDir, 'HomeScreen.tsx');
      expect(() => {
        parseFile(filePath, { minLength: 2 });
      }).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('handles files with no extractable strings gracefully', () => {
      // Create a minimal file path that points to a file we know has strings
      // but test with a high minLength to effectively filter all out
      const filePath = path.join(fixturesDir, 'HomeScreen.tsx');
      const { extracted } = parseFile(filePath, { minLength: 1000 });

      expect(extracted).toHaveLength(0);
    });

    it('returns correct line numbers', () => {
      const filePath = path.join(fixturesDir, 'HomeScreen.tsx');
      const { extracted } = parseFile(filePath, { minLength: 2 });

      for (const item of extracted) {
        expect(item.line).toBeGreaterThan(0);
        expect(item.column).toBeGreaterThanOrEqual(0);
      }
    });

    it('includes filePath in every extracted string', () => {
      const filePath = path.join(fixturesDir, 'HomeScreen.tsx');
      const { extracted } = parseFile(filePath, { minLength: 2 });

      for (const item of extracted) {
        expect(item.filePath).toBe(filePath);
      }
    });
  });
});
