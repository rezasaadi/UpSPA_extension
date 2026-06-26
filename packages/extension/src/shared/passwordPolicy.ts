export type PasswordPolicy = {
  minLen: number;
  maxLen: number;
  requireUpper: boolean;
  requireLower: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  allowedSymbols: string;
  forbidWhitespace: boolean;
  forbiddenSubstrings: string[];
};

export type PasswordPolicyState = {
  policy: PasswordPolicy;
  encoderCounter: number;
};

export type EncodedPasswordResult = {
  password: string;
  counter: number;
};

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT = '0123456789';
const DEFAULT_SYMBOLS = '!@#$%^&*';
const MAX_ATTEMPTS = 128;

export function defaultPasswordPolicy(): PasswordPolicy {
  return {
    minLen: 20,
    maxLen: 32,
    requireUpper: true,
    requireLower: true,
    requireDigit: true,
    requireSymbol: true,
    allowedSymbols: DEFAULT_SYMBOLS,
    forbidWhitespace: true,
    forbiddenSubstrings: [],
  };
}

function uniqueChars(input: string): string {
  const seen = new Set<string>();
  let out = '';
  for (const ch of input) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    out += ch;
  }
  return out;
}

export function normalizePasswordPolicy(policy: Partial<PasswordPolicy>): PasswordPolicy {
  const defaults = defaultPasswordPolicy();
  const merged: PasswordPolicy = {
    ...defaults,
    ...policy,
    forbiddenSubstrings: policy.forbiddenSubstrings ?? defaults.forbiddenSubstrings,
  };

  const requestedMax = Math.floor(Number(merged.maxLen) || defaults.maxLen);
  const cappedRequestedMax = Math.min(64, requestedMax);
  const requestedMin =
    policy.minLen === undefined && policy.maxLen !== undefined
      ? Math.min(defaults.minLen, cappedRequestedMax)
      : Math.floor(Number(merged.minLen) || defaults.minLen);
  const minLen = Math.max(8, requestedMin);
  const maxLen = Math.max(minLen, cappedRequestedMax);
  let allowedSymbols = String(merged.allowedSymbols || defaults.allowedSymbols);
  if (merged.forbidWhitespace) {
    allowedSymbols = allowedSymbols.replace(/\s/g, '');
  }
  allowedSymbols = uniqueChars(allowedSymbols);
  if (merged.requireSymbol && !allowedSymbols) {
    allowedSymbols = DEFAULT_SYMBOLS;
  }

  return {
    minLen,
    maxLen,
    requireUpper: Boolean(merged.requireUpper),
    requireLower: Boolean(merged.requireLower),
    requireDigit: Boolean(merged.requireDigit),
    requireSymbol: Boolean(merged.requireSymbol),
    allowedSymbols,
    forbidWhitespace: Boolean(merged.forbidWhitespace),
    forbiddenSubstrings: (merged.forbiddenSubstrings ?? [])
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function passwordSatisfiesPolicy(
  password: string,
  rawPolicy: PasswordPolicy,
  accountId?: string,
): boolean {
  const policy = normalizePasswordPolicy(rawPolicy);
  if (password.length < policy.minLen || password.length > policy.maxLen) return false;
  if (policy.requireUpper && !/[A-Z]/.test(password)) return false;
  if (policy.requireLower && !/[a-z]/.test(password)) return false;
  if (policy.requireDigit && !/[0-9]/.test(password)) return false;
  if (policy.requireSymbol && !Array.from(password).some((ch) => policy.allowedSymbols.includes(ch))) {
    return false;
  }
  if (policy.forbidWhitespace && /\s/.test(password)) return false;

  const lowerPassword = password.toLowerCase();
  for (const forbidden of policy.forbiddenSubstrings) {
    if (forbidden && lowerPassword.includes(forbidden)) return false;
  }
  const cleanAccountId = accountId?.trim().toLowerCase();
  if (cleanAccountId && lowerPassword.includes(cleanAccountId)) return false;

  return true;
}

function canonicalPolicy(policy: PasswordPolicy): string {
  return JSON.stringify(normalizePasswordPolicy(policy));
}

async function sha256Bytes(input: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

async function expandBytes(seed: string, length: number): Promise<Uint8Array> {
  const chunks: number[] = [];
  let block = 0;
  while (chunks.length < length) {
    const digest = await sha256Bytes(`${seed}|block=${block}`);
    chunks.push(...digest);
    block += 1;
  }
  return new Uint8Array(chunks.slice(0, length));
}

function pickChar(charset: string, byte: number): string {
  return charset[byte % charset.length];
}

function requiredCharsets(policy: PasswordPolicy): string[] {
  const charsets: string[] = [];
  if (policy.requireLower) charsets.push(LOWER);
  if (policy.requireUpper) charsets.push(UPPER);
  if (policy.requireDigit) charsets.push(DIGIT);
  if (policy.requireSymbol) charsets.push(policy.allowedSymbols);
  return charsets;
}

function buildCandidate(chars: string[], shuffleBytes: Uint8Array): string {
  const out = [...chars];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = shuffleBytes[i] % (i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out.join('');
}

export async function encodeSecretAsPassword(
  secretB64: string,
  rawPolicy: PasswordPolicy,
  accountId?: string,
  counter = 0,
): Promise<EncodedPasswordResult> {
  const policy = normalizePasswordPolicy(rawPolicy);
  const required = requiredCharsets(policy);
  if (required.length > policy.maxLen) {
    throw new Error('Password policy is impossible: more required classes than maximum length.');
  }

  const pool = uniqueChars(
    `${policy.requireLower ? LOWER : ''}${policy.requireUpper ? UPPER : ''}${policy.requireDigit ? DIGIT : ''}${
      policy.requireSymbol ? policy.allowedSymbols : ''
    }`,
  );
  if (!pool) throw new Error('Password policy is impossible: no allowed character set.');

  const length = Math.min(policy.maxLen, Math.max(policy.minLen, Math.min(32, policy.maxLen), required.length));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidateCounter = counter + attempt;
    const seed = [
      'upspa-password-encoding-v1',
      secretB64,
      canonicalPolicy(policy),
      accountId?.trim().toLowerCase() ?? '',
      String(candidateCounter),
    ].join('|');
    const bytes = await expandBytes(seed, length * 2 + required.length);
    const chars: string[] = [];

    for (let i = 0; i < required.length; i += 1) {
      chars.push(pickChar(required[i], bytes[i]));
    }
    for (let i = required.length; i < length; i += 1) {
      chars.push(pickChar(pool, bytes[i]));
    }

    const password = buildCandidate(chars, bytes.slice(length, length * 2));
    if (passwordSatisfiesPolicy(password, policy, accountId)) {
      return {
        password,
        counter: candidateCounter,
      };
    }
  }

  throw new Error('Could not encode a password that satisfies the site policy. Adjust the policy and try again.');
}
