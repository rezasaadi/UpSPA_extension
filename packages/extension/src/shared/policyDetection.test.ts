import { describe, expect, test } from 'vitest';
import {
  detectClassesFromText,
  detectFromPattern,
  detectLengthFromText,
  detectPasswordPolicy,
} from './policyDetection';

function detect(texts: string[], extra: Partial<Parameters<typeof detectPasswordPolicy>[0]> = {}) {
  return detectPasswordPolicy({ texts, ...extra });
}

describe('length detection from text', () => {
  test('"at least 8 characters" -> min 8', () => {
    const out = detectLengthFromText('Your password must be at least 8 characters.');
    expect(Math.max(...out.mins)).toBe(8);
    expect(out.maxes).toHaveLength(0);
  });

  test('"minimum of 12" -> min 12', () => {
    expect(Math.max(...detectLengthFromText('Use a minimum of 12 characters').mins)).toBe(12);
  });

  test('"8+ characters" -> min 8', () => {
    expect(Math.max(...detectLengthFromText('Passwords need 8+ characters').mins)).toBe(8);
  });

  test('range "8-64 characters" -> min 8, max 64', () => {
    const out = detectLengthFromText('Password must be 8-64 characters long.');
    expect(Math.max(...out.mins)).toBe(8);
    expect(Math.min(...out.maxes)).toBe(64);
  });

  test('"between 8 and 20" -> min 8, max 20', () => {
    const out = detectLengthFromText('Choose between 8 and 20 characters');
    expect(Math.max(...out.mins)).toBe(8);
    expect(Math.min(...out.maxes)).toBe(20);
  });

  test('"8 to 32 characters" -> min 8, max 32', () => {
    const out = detectLengthFromText('Must be 8 to 32 characters');
    expect(Math.max(...out.mins)).toBe(8);
    expect(Math.min(...out.maxes)).toBe(32);
  });

  test('"up to 128" / "no more than 64" -> max', () => {
    expect(Math.min(...detectLengthFromText('up to 128 characters').maxes)).toBe(128);
    expect(Math.min(...detectLengthFromText('no more than 64 characters').maxes)).toBe(64);
  });
});

describe('class detection from text', () => {
  test('detects uppercase, lowercase, digit, symbol', () => {
    const { hints } = detectClassesFromText(
      'Must include an uppercase letter, a lowercase letter, a number, and a special character.',
    );
    expect(hints.requireUpper).toBe(true);
    expect(hints.requireLower).toBe(true);
    expect(hints.requireDigit).toBe(true);
    expect(hints.requireSymbol).toBe(true);
  });

  test('"phone number" does NOT trigger a digit requirement', () => {
    const { hints } = detectClassesFromText('Enter your phone number to receive a code.');
    expect(hints.requireDigit).toBeUndefined();
  });

  test('"account number" alone does not trigger digit, but "one number" does', () => {
    expect(detectClassesFromText('your account number is shown above').hints.requireDigit).toBeUndefined();
    expect(detectClassesFromText('include at least one number').hints.requireDigit).toBe(true);
  });

  test('captures an explicitly listed allowed-symbol set', () => {
    const { hints } = detectClassesFromText('Allowed special characters: ! @ # $ only.');
    expect(hints.requireSymbol).toBe(true);
    expect(hints.allowedSymbols).toBe('!@#$');
  });

  test('symbol keyword without a listed set falls back to defaults', () => {
    const { hints } = detectClassesFromText('Must contain at least one symbol.');
    expect(hints.requireSymbol).toBe(true);
    expect(hints.allowedSymbols).toBe('!@#$%^&*');
  });

  test('"spaces are allowed" sets forbidWhitespace false', () => {
    expect(detectClassesFromText('Spaces are allowed in your password.').hints.forbidWhitespace).toBe(false);
  });

  test('"no spaces" sets forbidWhitespace true', () => {
    expect(detectClassesFromText('Password must contain no spaces.').hints.forbidWhitespace).toBe(true);
  });

  test('forbids username/email substrings', () => {
    const { hints } = detectClassesFromText('Your password cannot contain your username or email address.');
    expect(hints.forbiddenSubstrings).toContain('username');
    expect(hints.forbiddenSubstrings).toContain('email');
  });
});

describe('pattern attribute detection', () => {
  test('lookahead pattern: classes required, symbol set captured, min length', () => {
    const hints = detectFromPattern('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$');
    expect(hints.requireUpper).toBe(true);
    expect(hints.requireLower).toBe(true);
    expect(hints.requireDigit).toBe(true);
    expect(hints.requireSymbol).toBe(true);
    expect(hints.allowedSymbols).toBe('@$!%*?&');
    expect(hints.minLen).toBe(8);
    expect(hints.maxLen).toBeUndefined();
  });

  test('plain body class does not over-require classes (no lookaheads)', () => {
    const hints = detectFromPattern('[A-Za-z0-9]{6,12}');
    expect(hints.minLen).toBe(6);
    expect(hints.maxLen).toBe(12);
    // No lookaheads -> fall back to whole-pattern scan; letters/digits allowed.
    expect(hints.requireSymbol).toBeUndefined();
  });

  test('generic \\W requirement without explicit set', () => {
    const hints = detectFromPattern('^(?=.*\\W).{10,}$');
    expect(hints.requireSymbol).toBe(true);
    expect(hints.allowedSymbols).toBeUndefined();
    expect(hints.minLen).toBe(10);
  });
});

describe('end-to-end detectPasswordPolicy', () => {
  test('merges attributes, pattern, and text; most restrictive bounds win', () => {
    const { policyHints, evidence } = detect(
      ['Password must contain an uppercase letter and a number. Maximum 32 characters.'],
      { minlengthAttr: '10', maxlengthAttr: '40', required: true },
    );
    expect(policyHints.minLen).toBe(10);
    // text max 32 is more restrictive than attribute max 40.
    expect(policyHints.maxLen).toBe(32);
    expect(policyHints.requireUpper).toBe(true);
    expect(policyHints.requireDigit).toBe(true);
    expect(evidence.length).toBeGreaterThan(0);
  });

  test('conflicting bounds collapse to a fixed length', () => {
    const { policyHints } = detect(['Must be at least 20 characters.'], { maxlengthAttr: '12' });
    expect(policyHints.minLen).toBe(20);
    expect(policyHints.maxLen).toBe(20);
  });

  test('no signals yields an explanatory evidence note', () => {
    const { policyHints, evidence } = detect([]);
    expect(Object.keys(policyHints)).toHaveLength(0);
    expect(evidence.join(' ')).toMatch(/safe defaults/i);
  });
});
