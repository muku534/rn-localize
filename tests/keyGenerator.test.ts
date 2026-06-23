import { generateKey, slugify, toSnakeCase, KeyCollisionTracker } from '../src/keyGenerator';

describe('keyGenerator', () => {
  describe('toSnakeCase', () => {
    it('converts PascalCase to snake_case', () => {
      expect(toSnakeCase('HomeScreen')).toBe('home_screen');
      expect(toSnakeCase('ProfileScreen')).toBe('profile_screen');
      expect(toSnakeCase('SearchScreen')).toBe('search_screen');
    });

    it('converts camelCase to snake_case', () => {
      expect(toSnakeCase('myComponent')).toBe('my_component');
      expect(toSnakeCase('buttonGroup')).toBe('button_group');
    });

    it('handles single-word names', () => {
      expect(toSnakeCase('Button')).toBe('button');
      expect(toSnakeCase('header')).toBe('header');
    });

    it('handles acronyms', () => {
      expect(toSnakeCase('HTMLParser')).toBe('html_parser');
      expect(toSnakeCase('APIService')).toBe('api_service');
    });
  });

  describe('slugify', () => {
    it('converts normal strings to slug', () => {
      expect(slugify('Welcome back')).toBe('welcome_back');
      expect(slugify('Good morning!')).toBe('good_morning');
      expect(slugify('Get Started')).toBe('get_started');
    });

    it('handles emoji and special characters', () => {
      expect(slugify('Good morning 🌞')).toBe('good_morning');
      expect(slugify('Hello! @World#')).toBe('hello_world');
      expect(slugify('Price: $100')).toBe('price_100');
    });

    it('truncates long strings at 40 chars', () => {
      const longString = 'This is a very long string that should be truncated at forty characters exactly please';
      const result = slugify(longString);
      expect(result.length).toBeLessThanOrEqual(40);
    });

    it('trims trailing underscores', () => {
      // A string that would end with underscores after processing
      expect(slugify('hello!!!')).toBe('hello');
    });

    it('handles whitespace-only strings', () => {
      expect(slugify('   ')).toBe('');
    });
  });

  describe('generateKey', () => {
    it('generates correct keys from string and file path', () => {
      expect(generateKey('Welcome back', '/path/to/HomeScreen.tsx')).toBe(
        'home_screen.welcome_back'
      );
      expect(generateKey('Submit', '/path/to/ProfileScreen.tsx')).toBe(
        'profile_screen.submit'
      );
      expect(generateKey('Search...', '/path/to/SearchScreen.tsx')).toBe(
        'search_screen.search'
      );
    });

    it('respects --prefix override', () => {
      expect(generateKey('Submit', '/path/to/ProfileScreen.tsx', 'custom_prefix')).toBe(
        'custom_prefix.submit'
      );
    });

    it('handles files in nested directories', () => {
      expect(generateKey('Hello', '/path/to/components/Button.tsx')).toBe('button.hello');
    });

    it('handles empty slug gracefully', () => {
      // A string of only special characters that gets stripped entirely
      expect(generateKey('!!!', '/path/to/Home.tsx')).toBe('home.untranslated');
    });
  });

  describe('KeyCollisionTracker', () => {
    it('returns the same key for the first occurrence', () => {
      const tracker = new KeyCollisionTracker();
      const key = tracker.resolve('home.submit', 'Submit');
      expect(key).toBe('home.submit');
    });

    it('returns the same key for the same raw string', () => {
      const tracker = new KeyCollisionTracker();
      tracker.resolve('home.submit', 'Submit');
      const key2 = tracker.resolve('home.submit', 'Submit');
      expect(key2).toBe('home.submit');
    });

    it('appends numeric suffix for collisions', () => {
      const tracker = new KeyCollisionTracker();
      tracker.resolve('home.submit', 'Submit');
      const key2 = tracker.resolve('home.submit', 'Submit Form');
      expect(key2).toBe('home.submit_2');
    });

    it('increments suffix for multiple collisions', () => {
      const tracker = new KeyCollisionTracker();
      tracker.resolve('home.submit', 'Submit');
      tracker.resolve('home.submit', 'Submit Form');
      const key3 = tracker.resolve('home.submit', 'Submit Now');
      expect(key3).toBe('home.submit_3');
    });

    it('resets state correctly', () => {
      const tracker = new KeyCollisionTracker();
      tracker.resolve('home.submit', 'Submit');
      tracker.reset();
      const key = tracker.resolve('home.submit', 'Submit New');
      expect(key).toBe('home.submit');
    });
  });
});
