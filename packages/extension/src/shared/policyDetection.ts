import type { PasswordPolicy } from './passwordPolicy';

// ---------------------------------------------------------------------------
// Task 3 — Password policy detection
//
// This module holds the *pure* detection logic that turns whatever signals a
// web page exposes (input attributes, a `pattern`, and surrounding helper
// text) into a `Partial<PasswordPolicy>` plus human-readable evidence.
//
// It deliberately contains NO DOM or `chrome.*` access so it can be unit
// tested directly under Node/Vitest. The content script is responsible for
// collecting the signals from the live page and calling `detectPasswordPolicy`.
// ---------------------------------------------------------------------------

export type PasswordPolicySignals = {
  /** `minlength` attribute on the password input, if any. */
  minlengthAttr?: string | null;
  /** `maxlength` attribute on the password input, if any. */
  maxlengthAttr?: string | null;
  /** `pattern` attribute on the password input, if any. */
  patternAttr?: string | null;
  /** Whether the input is marked `required`. */
  required?: boolean;
  /** `autocomplete` token (e.g. `new-password`), if any. */
  autocomplete?: string | null;
  /**
   * Free-text snippets associated with the password field: label text, aria
   * descriptions, placeholder/title attributes, and nearby form/container
   * text. Order does not matter; they are concatenated for matching.
   */
  texts: string[];
};

export type PasswordPolicyDetection = {
  policyHints: Partial<PasswordPolicy>;
  evidence: string[];
};

const DEFAULT_SYMBOLS = '!@#$%^&*';
// Characters we are willing to recognise as members of an explicitly-listed
// "allowed special characters" set.
const SYMBOL_CHARS = '!@#$%^&*()_+-=[]{}|;:\'",.<>/?`~\\';
// The stricter alphabet used when scraping a listed allowed-set out of prose.
// Excludes punctuation that commonly appears as separators or sentence marks
// (colon, semicolon, comma, period, quotes, backtick, backslash) so that the
// colon in "special characters: ! @ # $" is not captured as a symbol.
const LISTABLE_SYMBOLS = '!@#$%^&*()_+-=[]{}|/?<>~';

type PartialHints = Partial<PasswordPolicy>;

type ClassResult = {
  hints: PartialHints;
  evidence: string[];
};

type LengthResult = {
  mins: number[];
  maxes: number[];
  evidence: string[];
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function pushEvidence(evidence: string[], text: string): void {
  const clean = normalizeWhitespace(text);
  if (clean && !evidence.includes(clean)) evidence.push(clean.slice(0, 220));
}

function toLength(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function uniqueSymbolChars(segment: string, allowed: string = SYMBOL_CHARS): string {
  const out: string[] = [];
  for (const ch of segment) {
    if (allowed.includes(ch) && !out.includes(ch)) out.push(ch);
  }
  return out.join('');
}

/**
 * Pull an explicitly-listed allowed-symbol set out of helper text such as
 * "allowed special characters: ! @ # $" or "symbols such as !@#$%".
 * Requires at least two distinct symbols so a stray "!" in prose is ignored.
 */
function extractListedSymbols(text: string): string {
  const cue =
    /(?:special characters?|symbols?|punctuation|such as|for example|e\.?g\.?|including|allowed|permitted|like)\s*[:\-—]?\s*([^.\n]{0,80})/gi;
  let best = '';
  let match: RegExpExecArray | null;
  while ((match = cue.exec(text)) !== null) {
    const found = uniqueSymbolChars(match[1] ?? '', LISTABLE_SYMBOLS);
    if (found.length > best.length) best = found;
  }
  return best.length >= 2 ? best : '';
}

// ---------------------------------------------------------------------------
// Length detection from free text
// ---------------------------------------------------------------------------

export function detectLengthFromText(text: string): LengthResult {
  const result: LengthResult = { mins: [], maxes: [], evidence: [] };
  const lower = text.toLowerCase();

  const addMin = (n: number) => {
    if (Number.isFinite(n)) {
      result.mins.push(n);
      pushEvidence(result.evidence, `detected minimum length ${n}`);
    }
  };
  const addMax = (n: number) => {
    if (Number.isFinite(n)) {
      result.maxes.push(n);
      pushEvidence(result.evidence, `detected maximum length ${n}`);
    }
  };

  // Ranges first: "8-64 characters", "8 to 32 characters", "between 8 and 20".
  const between = lower.match(/between\s+(\d{1,3})\s+and\s+(\d{1,3})/);
  if (between) {
    addMin(Number(between[1]));
    addMax(Number(between[2]));
  }
  const dashRange = lower.match(
    /\b(\d{1,3})\s*(?:-|–|—|to|through)\s*(\d{1,3})\s*(?:characters?|chars?|letters?|long)/,
  );
  if (dashRange) {
    addMin(Number(dashRange[1]));
    addMax(Number(dashRange[2]));
  }

  // Minimums.
  const minPhrases = [
    /(?:at least|minimum(?:\s+of)?|min(?:imum)?|no\s+fewer\s+than|no\s+less\s+than)\s+(\d{1,3})/,
    /(\d{1,3})\s*\+\s*(?:characters?|chars?)/,
    /(\d{1,3})\s+(?:characters?|chars?)\s+(?:or\s+more|minimum|min)/,
    /(\d{1,3})\s+or\s+more\s+(?:characters?|chars?)/,
  ];
  for (const re of minPhrases) {
    const m = lower.match(re);
    if (m) addMin(Number(m[1]));
  }

  // Maximums.
  const maxPhrases = [
    /(?:at most|maximum(?:\s+of)?|max(?:imum)?|no\s+more\s+than|up\s+to|not\s+(?:more|longer)\s+than)\s+(\d{1,3})/,
    /(\d{1,3})\s+(?:characters?|chars?)\s+(?:maximum|max|or\s+fewer|or\s+less)/,
  ];
  for (const re of maxPhrases) {
    const m = lower.match(re);
    if (m) addMax(Number(m[1]));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Character-class detection from free text
// ---------------------------------------------------------------------------

// Phrases like "phone number" / "account number" must NOT be read as a digit
// requirement. Strip them before testing for the word "number".
const NON_PASSWORD_NUMBER =
  /\b(?:phone|telephone|mobile|cell|account|card|credit\s*card|debit\s*card|social\s*security|ssn|id|order|reference|ref|member|membership|customer|policy|invoice|routing|cvv|pin|zip|postal)\s+numbers?\b/gi;

export function detectClassesFromText(text: string): ClassResult {
  const hints: PartialHints = {};
  const evidence: string[] = [];
  const lower = text.toLowerCase();

  if (/upper[\s-]?case|capital letter/.test(lower)) {
    hints.requireUpper = true;
    pushEvidence(evidence, 'detected uppercase requirement');
  }
  if (/lower[\s-]?case/.test(lower)) {
    hints.requireLower = true;
    pushEvidence(evidence, 'detected lowercase requirement');
  }

  const digitText = lower.replace(NON_PASSWORD_NUMBER, ' ');
  if (/\b(?:digits?|numerals?|numeric)\b/.test(digitText) || /\bnumbers?\b/.test(digitText)) {
    hints.requireDigit = true;
    pushEvidence(evidence, 'detected digit requirement');
  }

  const symbolKeyword = /special character|symbol|punctuation|non[\s-]?alphanumeric/.test(lower);
  const listed = extractListedSymbols(text);
  if (symbolKeyword || listed) {
    hints.requireSymbol = true;
    hints.allowedSymbols = listed || DEFAULT_SYMBOLS;
    pushEvidence(
      evidence,
      listed ? `detected symbol requirement (allowed set: ${listed})` : 'detected symbol requirement',
    );
  }

  // Whitespace: an explicit "spaces allowed" overrides the default of forbidding.
  if (/spaces?\s+(?:are\s+)?allowed|may\s+contain\s+spaces|passphrase/.test(lower)) {
    hints.forbidWhitespace = false;
    pushEvidence(evidence, 'detected that spaces are allowed');
  } else if (
    /no\s+spaces|without\s+spaces|cannot\s+contain\s+(?:a\s+)?spaces?|must\s+not\s+contain\s+(?:a\s+)?spaces?|spaces?\s+(?:are\s+)?not\s+allowed/.test(
      lower,
    )
  ) {
    hints.forbidWhitespace = true;
    pushEvidence(evidence, 'detected no-whitespace requirement');
  }

  const forbidden: string[] = [];
  const noContain = /(?:not\s+contain|cannot\s+contain|can't\s+contain|must\s+not\s+include|may\s+not\s+contain|no)\b[^.]{0,24}/g;
  let nc: RegExpExecArray | null;
  while ((nc = noContain.exec(lower)) !== null) {
    const seg = nc[0];
    if (/\b(?:username|user name|login)\b/.test(seg) && !forbidden.includes('username')) forbidden.push('username');
    if (/\be-?mail\b/.test(seg) && !forbidden.includes('email')) forbidden.push('email');
  }
  if (forbidden.length) {
    hints.forbiddenSubstrings = forbidden;
    pushEvidence(evidence, `detected forbidden substrings: ${forbidden.join(', ')}`);
  }

  return { hints, evidence };
}

// ---------------------------------------------------------------------------
// Detection from an HTML `pattern` attribute
// ---------------------------------------------------------------------------

function lookaheadBodies(pattern: string): string[] {
  return [...pattern.matchAll(/\(\?=([^)]*)\)/g)].map((m) => m[1]);
}

function charClasses(source: string): string[] {
  return [...source.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
}

function classIsSymbolOnly(cls: string): boolean {
  // No letter/digit ranges or word/digit shorthands -> treat as a symbol set.
  return cls.length > 0 && !/A-Z|a-z|0-9|\\w|\\d/i.test(cls);
}

export function detectFromPattern(pattern: string): PartialHints {
  const hints: PartialHints = {};

  // Length: take the most restrictive {n,m} bounds found anywhere.
  const quants = [...pattern.matchAll(/\{(\d+),(\d*)\}/g)];
  const mins: number[] = [];
  const maxes: number[] = [];
  for (const q of quants) {
    mins.push(Number(q[1]));
    if (q[2]) maxes.push(Number(q[2]));
  }
  if (mins.length) hints.minLen = Math.max(...mins);
  if (maxes.length) hints.maxLen = Math.min(...maxes);

  // Class requirements. When the pattern uses lookaheads, only classes inside a
  // lookahead are *required*; the trailing body class merely lists allowed
  // characters. Without lookaheads we fall back to scanning the whole pattern.
  const lookaheads = lookaheadBodies(pattern);
  const requirementScope = lookaheads.length > 0 ? lookaheads.join(' ') : pattern;

  if (/A-Z/.test(requirementScope)) hints.requireUpper = true;
  if (/a-z/.test(requirementScope)) hints.requireLower = true;
  if (/\\d|0-9/.test(requirementScope)) hints.requireDigit = true;

  // Symbol set: prefer a symbol-only class found in a requirement scope.
  let symbolSet = '';
  for (const cls of charClasses(requirementScope)) {
    if (classIsSymbolOnly(cls)) {
      const syms = uniqueSymbolChars(cls);
      if (syms.length > symbolSet.length) symbolSet = syms;
    }
  }
  if (symbolSet) {
    hints.requireSymbol = true;
    hints.allowedSymbols = symbolSet;
  } else if (/\\W|\[\^/.test(requirementScope)) {
    hints.requireSymbol = true;
  }

  return hints;
}

// ---------------------------------------------------------------------------
// Merge + top-level entry point
// ---------------------------------------------------------------------------

function mergeHints(target: PartialHints, source: PartialHints): void {
  for (const key of ['requireUpper', 'requireLower', 'requireDigit', 'requireSymbol'] as const) {
    if (source[key]) target[key] = true;
  }
  if (source.allowedSymbols !== undefined) target.allowedSymbols = source.allowedSymbols;
  if (source.forbidWhitespace !== undefined) target.forbidWhitespace = source.forbidWhitespace;
  if (source.forbiddenSubstrings && source.forbiddenSubstrings.length) {
    const merged = new Set([...(target.forbiddenSubstrings ?? []), ...source.forbiddenSubstrings]);
    target.forbiddenSubstrings = [...merged];
  }
}

export function detectPasswordPolicy(signals: PasswordPolicySignals): PasswordPolicyDetection {
  const hints: PartialHints = {};
  const evidence: string[] = [];
  const mins: number[] = [];
  const maxes: number[] = [];

  const attrMin = toLength(signals.minlengthAttr);
  if (attrMin !== undefined) {
    mins.push(attrMin);
    pushEvidence(evidence, `password input minlength=${attrMin}`);
  }
  const attrMax = toLength(signals.maxlengthAttr);
  if (attrMax !== undefined) {
    maxes.push(attrMax);
    pushEvidence(evidence, `password input maxlength=${attrMax}`);
  }
  if (signals.required) pushEvidence(evidence, 'password input required=true');
  if (signals.autocomplete) pushEvidence(evidence, `password input autocomplete=${signals.autocomplete}`);

  if (signals.patternAttr && signals.patternAttr.trim()) {
    pushEvidence(evidence, `pattern attribute present: ${signals.patternAttr}`);
    const fromPattern = detectFromPattern(signals.patternAttr);
    if (fromPattern.minLen !== undefined) mins.push(fromPattern.minLen);
    if (fromPattern.maxLen !== undefined) maxes.push(fromPattern.maxLen);
    mergeHints(hints, fromPattern);
  }

  const joined = signals.texts.map(normalizeWhitespace).filter(Boolean).join('  ');
  if (joined) {
    const len = detectLengthFromText(joined);
    mins.push(...len.mins);
    maxes.push(...len.maxes);
    for (const note of len.evidence) pushEvidence(evidence, note);

    const cls = detectClassesFromText(joined);
    mergeHints(hints, cls.hints);
    for (const note of cls.evidence) pushEvidence(evidence, note);
  }

  if (mins.length) hints.minLen = Math.max(...mins);
  if (maxes.length) hints.maxLen = Math.min(...maxes);
  if (hints.minLen !== undefined && hints.maxLen !== undefined && hints.minLen > hints.maxLen) {
    pushEvidence(
      evidence,
      `length bounds conflict (min ${hints.minLen} > max ${hints.maxLen}); using minimum as a fixed length`,
    );
    hints.maxLen = hints.minLen;
  }

  if (evidence.length === 0) {
    pushEvidence(evidence, 'No explicit password policy was found on the page; using safe defaults.');
  }

  return { policyHints: hints, evidence };
}
