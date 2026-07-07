import type { ContentFillRequest, ContentFillResponse, PasswordPolicyExtractionResponse } from '../shared/messages';
import type { PasswordPolicy } from '../shared/passwordPolicy';

function isVisibleEditableInput(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly) return false;
  if (input.type === 'hidden') return false;

  const rect = input.getBoundingClientRect();
  const hasBox = rect.width > 0 && rect.height > 0;
  if (!input.offsetParent && !hasBox) return false;

  const style = window.getComputedStyle(input);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function documentOrder(a: HTMLInputElement, b: HTMLInputElement): number {
  if (a === b) return 0;
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function getVisiblePasswordInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'))
    .filter(isVisibleEditableInput)
    .sort(documentOrder);
}

function findUsernameInput(passwordInput?: HTMLInputElement): HTMLInputElement | null {
  const selectors = [
    'input[autocomplete="username"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[name*="email" i]',
    'input[id*="email" i]',
    'input[name*="user" i]',
    'input[id*="user" i]',
    'input[name*="login" i]',
    'input[id*="login" i]',
    'input[name*="phone" i]',
    'input[id*="phone" i]',
    'input[name*="mobile" i]',
    'input[id*="mobile" i]',
  ];

  const candidateSet = new Set<HTMLInputElement>();
  for (const selector of selectors) {
    document.querySelectorAll<HTMLInputElement>(selector).forEach((input) => {
      if (isVisibleEditableInput(input)) candidateSet.add(input);
    });
  }

  const candidates = Array.from(candidateSet).sort(documentOrder);
  const beforePassword = passwordInput
    ? candidates.find((input) => input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_FOLLOWING)
    : undefined;
  if (beforePassword) return beforePassword;
  if (candidates[0]) return candidates[0];

  if (!passwordInput) return null;

  const textInputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input:not([type]), input[type="text"], input[type="email"], input[type="search"], input[type="tel"], input[type="url"]',
    ),
  )
    .filter(isVisibleEditableInput)
    .sort(documentOrder);

  return (
    textInputs.find((input) => input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_FOLLOWING) ??
    null
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillRegister(accountId: string, passwordForLs: string): ContentFillResponse {
  const passwordInputs = getVisiblePasswordInputs();
  if (passwordInputs.length < 1) {
    return { ok: false, error: 'No visible password field found for registration.' };
  }

  let usernameFilled = false;
  let passwordsFilled = 0;
  const usernameInput = findUsernameInput(passwordInputs[0]);
  if (usernameInput) {
    setInputValue(usernameInput, accountId);
    usernameFilled = true;
  }

  setInputValue(passwordInputs[0], passwordForLs);
  passwordsFilled += 1;
  if (passwordInputs[1]) {
    setInputValue(passwordInputs[1], passwordForLs);
    passwordsFilled += 1;
  }

  return { ok: true, filled: { username: usernameFilled, passwords: passwordsFilled } };
}

function fillLogin(accountId: string, passwordForLs: string): ContentFillResponse {
  const passwordInputs = getVisiblePasswordInputs();
  if (passwordInputs.length < 1) {
    return { ok: false, error: 'No visible password field found for login.' };
  }

  const usernameInput = findUsernameInput(passwordInputs[0]);
  if (!usernameInput) {
    return { ok: false, error: 'No visible username, email, or phone field found for login.' };
  }

  setInputValue(usernameInput, accountId);
  setInputValue(passwordInputs[0], passwordForLs);
  return { ok: true, filled: { username: true, passwords: 1 } };
}

function fillPasswordChange(oldPasswordForLs: string, newPasswordForLs: string): ContentFillResponse {
  const passwordInputs = getVisiblePasswordInputs();
  if (passwordInputs.length < 2) {
    return {
      ok: false,
      error: 'Password-change form needs at least old/current and new password fields.',
    };
  }

  setInputValue(passwordInputs[0], oldPasswordForLs);
  let passwordsFilled = 1;
  for (const input of passwordInputs.slice(1)) {
    setInputValue(input, newPasswordForLs);
    passwordsFilled += 1;
  }

  return { ok: true, filled: { username: false, passwords: passwordsFilled } };
}

function visibleText(el: Element | null): string {
  if (!el) return '';
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return '';
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function addEvidence(evidence: string[], text: string): void {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return;
  if (!evidence.includes(clean)) evidence.push(clean.slice(0, 220));
}

function getAssociatedText(input: HTMLInputElement, evidence: string[]): string {
  const parts: string[] = [];
  const id = input.id;
  if (id) {
    document.querySelectorAll(`label[for="${CSS.escape(id)}"]`).forEach((label) => {
      const text = visibleText(label);
      if (text) {
        parts.push(text);
        addEvidence(evidence, `label text: ${text}`);
      }
    });
  }

  const wrappingLabel = input.closest('label');
  const wrappingLabelText = visibleText(wrappingLabel);
  if (wrappingLabelText) {
    parts.push(wrappingLabelText);
    addEvidence(evidence, `label text: ${wrappingLabelText}`);
  }

  const describedBy = `${input.getAttribute('aria-describedby') ?? ''} ${
    input.getAttribute('aria-errormessage') ?? ''
  }`;
  describedBy
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((idRef) => {
      const text = visibleText(document.getElementById(idRef));
      if (text) {
        parts.push(text);
        addEvidence(evidence, `aria text: ${text}`);
      }
    });

  for (const attr of ['title', 'placeholder', 'autocomplete']) {
    const value = input.getAttribute(attr);
    if (value) {
      parts.push(value);
      addEvidence(evidence, `password input ${attr}=${value}`);
    }
  }

  const form = input.form ?? input.closest('form');
  const formText = visibleText(form);
  if (formText) {
    parts.push(formText);
    addEvidence(evidence, `form text: ${formText}`);
  } else {
    const containerText = visibleText(input.closest('section, article, main, div'));
    if (containerText) {
      parts.push(containerText);
      addEvidence(evidence, `nearby text: ${containerText}`);
    }
  }

  return parts.join(' ');
}

function inferPolicyFromText(text: string, hints: Partial<PasswordPolicy>, evidence: string[]): void {
  const lower = text.toLowerCase();
  const minMatch =
    lower.match(/(?:at least|minimum|min)\s+(\d{1,3})/) ??
    lower.match(/(\d{1,3})\s+(?:characters?|chars?)\s+(?:minimum|min)/);
  if (minMatch) {
    hints.minLen = Number(minMatch[1]);
    addEvidence(evidence, `detected minimum length ${minMatch[1]}`);
  }

  const maxMatch =
    lower.match(/(?:maximum|max|up to|no more than)\s+(\d{1,3})/) ??
    lower.match(/(\d{1,3})\s+(?:characters?|chars?)\s+(?:maximum|max)/);
  if (maxMatch) {
    hints.maxLen = Number(maxMatch[1]);
    addEvidence(evidence, `detected maximum length ${maxMatch[1]}`);
  }

  if (/(uppercase|capital letter)/i.test(text)) {
    hints.requireUpper = true;
    addEvidence(evidence, 'detected uppercase requirement');
  }
  if (/lowercase/i.test(text)) {
    hints.requireLower = true;
    addEvidence(evidence, 'detected lowercase requirement');
  }
  if (/(number|digit)/i.test(text)) {
    hints.requireDigit = true;
    addEvidence(evidence, 'detected digit requirement');
  }
  if (/(special character|symbol)/i.test(text) || /[!@#$%^&*]/.test(text)) {
    hints.requireSymbol = true;
    hints.allowedSymbols = '!@#$%^&*';
    addEvidence(evidence, 'detected symbol requirement');
  }
  if (/(no spaces|must not contain spaces|without spaces)/i.test(text)) {
    hints.forbidWhitespace = true;
    addEvidence(evidence, 'detected no-whitespace requirement');
  }
  if (/(must not contain username|cannot contain username|cannot contain email|must not contain email)/i.test(text)) {
    hints.forbiddenSubstrings = ['username', 'email'];
    addEvidence(evidence, 'detected no username/email requirement');
  }
}

function inferPolicyFromPattern(pattern: string, hints: Partial<PasswordPolicy>, evidence: string[]): void {
  addEvidence(evidence, `pattern attribute present: ${pattern}`);
  const minMax = pattern.match(/\{(\d+),(\d*)\}/);
  if (minMax) {
    hints.minLen = Number(minMax[1]);
    if (minMax[2]) hints.maxLen = Number(minMax[2]);
  }
  if (/A-Z/.test(pattern)) hints.requireUpper = true;
  if (/a-z/.test(pattern)) hints.requireLower = true;
  if (/\\d|0-9/.test(pattern)) hints.requireDigit = true;
  if (/[!@#$%^&*]/.test(pattern)) {
    hints.requireSymbol = true;
    hints.allowedSymbols = '!@#$%^&*';
  }
}

function extractPasswordPolicy(): PasswordPolicyExtractionResponse {
  const passwordInputs = getVisiblePasswordInputs();
  const input = passwordInputs[0];
  if (!input) {
    return { ok: false, error: 'No visible password field found for policy detection.' };
  }

  const hints: Partial<PasswordPolicy> = {};
  const evidence: string[] = [];
  const minlength = input.getAttribute('minlength');
  const maxlength = input.getAttribute('maxlength');
  const pattern = input.getAttribute('pattern');

  if (minlength) {
    hints.minLen = Number(minlength);
    addEvidence(evidence, `password input minlength=${minlength}`);
  }
  if (maxlength) {
    hints.maxLen = Number(maxlength);
    addEvidence(evidence, `password input maxlength=${maxlength}`);
  }
  if (pattern) {
    inferPolicyFromPattern(pattern, hints, evidence);
  }
  if (input.required) addEvidence(evidence, 'password input required=true');

  const text = getAssociatedText(input, evidence);
  inferPolicyFromText(text, hints, evidence);

  if (evidence.length === 0) {
    addEvidence(evidence, 'No explicit password policy was found on the page; using safe defaults.');
  }

  return {
    ok: true,
    policyHints: hints,
    evidence,
  };
}

chrome.runtime.onMessage.addListener((message: ContentFillRequest, _sender, sendResponse) => {
  try {
    if (message.type === 'UPSPA_EXTRACT_PASSWORD_POLICY') {
      sendResponse(extractPasswordPolicy());
      return;
    }
    if (message.type === 'UPSPA_FILL_REGISTER') {
      sendResponse(fillRegister(message.payload.accountId, message.payload.passwordForLs));
      return;
    }
    if (message.type === 'UPSPA_FILL_LOGIN') {
      sendResponse(fillLogin(message.payload.accountId, message.payload.passwordForLs));
      return;
    }
    if (message.type === 'UPSPA_FILL_PASSWORD_CHANGE') {
      sendResponse(fillPasswordChange(message.payload.oldPasswordForLs, message.payload.newPasswordForLs));
      return;
    }
  } catch (e) {
    sendResponse({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
