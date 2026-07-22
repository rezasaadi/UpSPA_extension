import type { ContentFillRequest, ContentFillResponse, PasswordPolicyExtractionResponse } from '../shared/messages';
import { detectPasswordPolicy, type PasswordPolicySignals } from '../shared/policyDetection';

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

function collectAssociatedTexts(input: HTMLInputElement): string[] {
  const texts: string[] = [];
  const push = (value: string | null | undefined) => {
    const clean = (value ?? '').replace(/\s+/g, ' ').trim();
    if (clean) texts.push(clean);
  };

  const id = input.id;
  if (id) {
    document.querySelectorAll(`label[for="${CSS.escape(id)}"]`).forEach((label) => push(visibleText(label)));
  }
  push(visibleText(input.closest('label')));

  const describedBy = `${input.getAttribute('aria-describedby') ?? ''} ${input.getAttribute('aria-errormessage') ?? ''}`;
  describedBy
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((idRef) => push(visibleText(document.getElementById(idRef))));

  push(input.getAttribute('title'));
  push(input.getAttribute('placeholder'));

  const form = input.form ?? input.closest('form');
  const formText = visibleText(form);
  if (formText) {
    push(formText);
  } else {
    push(visibleText(input.closest('section, article, main, div')));
  }

  return texts;
}

function gatherPolicySignals(input: HTMLInputElement): PasswordPolicySignals {
  return {
    minlengthAttr: input.getAttribute('minlength'),
    maxlengthAttr: input.getAttribute('maxlength'),
    patternAttr: input.getAttribute('pattern'),
    required: input.required,
    autocomplete: input.getAttribute('autocomplete'),
    texts: collectAssociatedTexts(input),
  };
}

function extractPasswordPolicy(): PasswordPolicyExtractionResponse {
  const input = getVisiblePasswordInputs()[0];
  if (!input) {
    return { ok: false, error: 'No visible password field found for policy detection.' };
  }
  const { policyHints, evidence } = detectPasswordPolicy(gatherPolicySignals(input));
  return { ok: true, policyHints, evidence };
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
