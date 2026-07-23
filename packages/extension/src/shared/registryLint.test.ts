import { describe, expect, test } from 'vitest';
import {
  encodeSecretAsPassword,
  normalizePasswordPolicy,
  type PasswordPolicy,
} from './passwordPolicy';
import { SUPPORTED_PROTOTYPE_SITES } from './supportedSites';

// ---------------------------------------------------------------------------
// Registry lint — data-quality checks for the site registry.
//
// Purpose: as the registry grows toward ~200 sites, most policy work is data
// entry. These tests catch a broken entry at commit time instead of mid-study:
// an impossible policy, a symbol requirement with no allowed set, a
// registration-unsupported site with no participant guidance, or a policy the
// Task 6 encoder cannot actually satisfy.
//
// Pure data checks + one deterministic encoder run per unique policy.
// No DOM, no chrome.*, no network. Runs under the normal vitest suite.
// ---------------------------------------------------------------------------

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT = '0123456789';

function requiredClassCount(policy: PasswordPolicy): number {
  let n = 0;
  if (policy.requireLower) n += 1;
  if (policy.requireUpper) n += 1;
  if (policy.requireDigit) n += 1;
  if (policy.requireSymbol) n += 1;
  return n;
}

function poolFor(policy: PasswordPolicy): string {
  return (
    (policy.requireLower ? LOWER : '') +
    (policy.requireUpper ? UPPER : '') +
    (policy.requireDigit ? DIGIT : '') +
    (policy.requireSymbol ? policy.allowedSymbols : '')
  );
}

/** Deduplicate policies so the (async) encoder check runs once per shape. */
function uniquePolicies(): Map<string, { policy: PasswordPolicy; siteIds: string[] }> {
  const map = new Map<string, { policy: PasswordPolicy; siteIds: string[] }>();
  for (const site of SUPPORTED_PROTOTYPE_SITES) {
    const normalized = normalizePasswordPolicy(site.policy);
    const key = JSON.stringify(normalized);
    const entry = map.get(key);
    if (entry) entry.siteIds.push(site.id);
    else map.set(key, { policy: normalized, siteIds: [site.id] });
  }
  return map;
}

describe('registry lint: per-site policy sanity', () => {
  for (const site of SUPPORTED_PROTOTYPE_SITES) {
    describe(site.id, () => {
      const policy = normalizePasswordPolicy(site.policy);

      test('normalizes to a consistent length window', () => {
        expect(policy.minLen).toBeLessThanOrEqual(policy.maxLen);
        expect(policy.minLen).toBeGreaterThanOrEqual(8); // normalizer floor
        expect(policy.maxLen).toBeLessThanOrEqual(64); // normalizer cap
      });

      test('required classes fit within maxLen (encoder impossibility guard)', () => {
        expect(requiredClassCount(policy)).toBeLessThanOrEqual(policy.maxLen);
      });

      test('character pool is non-empty', () => {
        expect(poolFor(policy).length).toBeGreaterThan(0);
      });

      test('symbol requirement comes with an allowed set', () => {
        if (policy.requireSymbol) {
          expect(policy.allowedSymbols.length).toBeGreaterThan(0);
        }
      });

      test('has a human-readable policy note and source', () => {
        // The note is what the popup shows on a rejection; an empty one makes
        // the failure message useless to a participant.
        expect(site.policyNote.trim().length).toBeGreaterThan(0);
        expect(site.policySource.trim().length).toBeGreaterThan(0);
      });

      test('registration-unsupported sites carry participant guidance', () => {
        if (site.registrationSupported === false) {
          const hasGuidance =
            Boolean(site.registrationInfoUrl) || site.policyNote.trim().length > 0;
          expect(hasGuidance).toBe(true);
        }
      });
    });
  }
});

describe('registry lint: every unique policy is actually encodable', () => {
  // A synthetic, high-entropy stand-in for vInfo. The encoder only needs bytes;
  // determinism means this check is stable across runs.
  const SYNTHETIC_SECRET_B64 = 'bGludC1zeW50aGV0aWMtdmluZm8tZm9yLXJlZ2lzdHJ5LWNoZWNr';

  for (const [, { policy, siteIds }] of uniquePolicies()) {
    test(`encodes for: ${siteIds.join(', ')}`, async () => {
      const result = await encodeSecretAsPassword(
        SYNTHETIC_SECRET_B64,
        policy,
        'lint-account',
        0,
      );
      expect(result.counter).toBe(0);
      expect(result.password.length).toBeGreaterThanOrEqual(policy.minLen);
      expect(result.password.length).toBeLessThanOrEqual(policy.maxLen);
      if (policy.requireUpper) expect(result.password).toMatch(/[A-Z]/);
      if (policy.requireLower) expect(result.password).toMatch(/[a-z]/);
      if (policy.requireDigit) expect(result.password).toMatch(/[0-9]/);
      if (policy.forbidWhitespace) expect(result.password).not.toMatch(/\s/);
    });
  }
});
