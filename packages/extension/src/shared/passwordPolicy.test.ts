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

describe('deterministic encoder (Task 6 guarantees)', () => {
  test('returned counter equals the requested counter (stable rotation index)', async () => {
    const policy = normalizePasswordPolicy({ minLen: 12, maxLen: 20 });
    const out = await encodeSecretAsPassword(SECRET, policy, 'alice', 7);
    expect(out.counter).toBe(7);
  });

  test('same counter reproduces the same password (register == login)', async () => {
    const policy = defaultPasswordPolicy();
    const reg = await encodeSecretAsPassword(SECRET, policy, 'alice@example.com', 5);
    const login = await encodeSecretAsPassword(SECRET, policy, 'alice@example.com', reg.counter);
    expect(login.password).toBe(reg.password);
  });

  test('accepts a JSON-string policy identically to the object form', async () => {
    const obj = normalizePasswordPolicy({ minLen: 12, maxLen: 24 });
    const json = JSON.stringify(obj);
    const fromJson = await encodeSecretAsPassword(SECRET, json, 'alice', 0);
    const fromObj = await encodeSecretAsPassword(SECRET, obj, 'alice', 0);
    expect(fromJson.password).toBe(fromObj.password);
    expect(passwordSatisfiesPolicy(fromJson.password, obj, 'alice')).toBe(true);
  });

  test('invalid JSON policy throws a clean error', async () => {
    await expect(encodeSecretAsPassword(SECRET, '{not valid', 'alice', 0)).rejects.toThrow(/not valid JSON/);
  });

  test('fixed-length policy (min == max) yields exact length', async () => {
    const policy = normalizePasswordPolicy({ minLen: 16, maxLen: 16 });
    const out = await encodeSecretAsPassword(SECRET, policy, 'alice', 0);
    expect(out.password.length).toBe(16);
    expect(passwordSatisfiesPolicy(out.password, policy, 'alice')).toBe(true);
  });

  test('honours a restricted allowed-symbol set', async () => {
    const policy = normalizePasswordPolicy({
      minLen: 16,
      maxLen: 20,
      requireSymbol: true,
      allowedSymbols: '-_.',
    });
    const out = await encodeSecretAsPassword(SECRET, policy, 'alice', 0);
    for (const ch of out.password) {
      if (!/[A-Za-z0-9]/.test(ch)) {
        expect('-_.'.includes(ch)).toBe(true);
      }
    }
    expect(passwordSatisfiesPolicy(out.password, policy, 'alice')).toBe(true);
  });
});
