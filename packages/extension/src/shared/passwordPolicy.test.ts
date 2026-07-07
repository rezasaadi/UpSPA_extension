import { beforeAll, describe, expect, test } from 'vitest';
// Test-only Node WebCrypto shim for Vitest's node environment.
// @ts-ignore Node types are not part of the extension tsconfig.
import { webcrypto } from 'node:crypto';
import {
  defaultPasswordPolicy,
  encodeSecretAsPassword,
  normalizePasswordPolicy,
  passwordSatisfiesPolicy,
} from './passwordPolicy';

const SECRET = 'raw-upspa-secret-for-tests';

beforeAll(async () => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      value: webcrypto,
      configurable: true,
    });
  }
});

describe('password policy encoding', () => {
  test('default policy output satisfies policy', async () => {
    const policy = defaultPasswordPolicy();
    const out = await encodeSecretAsPassword(SECRET, policy, 'alice@example.com');
    expect(passwordSatisfiesPolicy(out.password, policy, 'alice@example.com')).toBe(true);
  });

  test('encoding is deterministic', async () => {
    const policy = defaultPasswordPolicy();
    const a = await encodeSecretAsPassword(SECRET, policy, 'alice@example.com', 3);
    const b = await encodeSecretAsPassword(SECRET, policy, 'alice@example.com', 3);
    expect(a).toEqual(b);
  });

  test('different counter gives different password', async () => {
    const policy = defaultPasswordPolicy();
    const a = await encodeSecretAsPassword(SECRET, policy, 'alice@example.com', 1);
    const b = await encodeSecretAsPassword(SECRET, policy, 'alice@example.com', 2);
    expect(a.password).not.toBe(b.password);
  });

  test('maxLen 16 works', async () => {
    const policy = normalizePasswordPolicy({ maxLen: 16 });
    const out = await encodeSecretAsPassword(SECRET, policy, 'alice@example.com');
    expect(out.password.length).toBeLessThanOrEqual(16);
    expect(passwordSatisfiesPolicy(out.password, policy, 'alice@example.com')).toBe(true);
  });

  test('no-symbol policy works', async () => {
    const policy = normalizePasswordPolicy({
      requireSymbol: false,
      allowedSymbols: '',
    });
    const out = await encodeSecretAsPassword(SECRET, policy, 'alice@example.com');
    expect(passwordSatisfiesPolicy(out.password, policy, 'alice@example.com')).toBe(true);
  });

  test('accountId forbidden substring is avoided', async () => {
    const policy = normalizePasswordPolicy({
      minLen: 12,
      maxLen: 20,
    });
    const out = await encodeSecretAsPassword(SECRET, policy, 'alice');
    expect(out.password.toLowerCase()).not.toContain('alice');
    expect(passwordSatisfiesPolicy(out.password, policy, 'alice')).toBe(true);
  });

  test('impossible policy throws clean error', async () => {
    const forbiddenSubstrings = [
      ...'abcdefghijklmnopqrstuvwxyz',
      ...'0123456789',
      '!',
      '@',
      '#',
      '$',
      '%',
      '^',
      '&',
      '*',
    ];
    const policy = normalizePasswordPolicy({
      minLen: 8,
      maxLen: 12,
      forbiddenSubstrings,
    });
    await expect(encodeSecretAsPassword(SECRET, policy, 'alice')).rejects.toThrow(/Could not encode/);
  });
});
