/**
 * autofill-engine.ts — Universal, site-agnostic autofill engine (content script).
 *
 * Architecture:
 *   RootRegistry        — forest of scannable roots (document, open ShadowRoots, same-origin iframes)
 *   HeuristicEngine     — weighted-regex field classifier + topological form-intent classifier
 *   MutationLifecycle   — dirty-root marking, trailing debounce + max-wait, idle-time rescans
 *   EventInterceptor    — capture-phase focusin/input/submit with composedPath() recovery
 *
 * No site-specific rules. All state is WeakMap/WeakSet-keyed for automatic GC of removed nodes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FieldRole =
  | 'username'
  | 'email'
  | 'current-password'
  | 'new-password'
  | 'confirm-password'
  | 'otp'
  | 'unknown';

export type FormIntent = 'login' | 'register' | 'password-update' | 'password-reset' | 'unknown';

export interface ClassifiedField {
  readonly element: HTMLInputElement;
  readonly role: FieldRole;
  /** 0..1 — 1.0 means authoritative (autocomplete token). */
  readonly confidence: number;
  readonly visible: boolean;
}

export interface ClassifiedForm {
  /** <form> when present, otherwise the smallest common container of the field cluster. */
  readonly container: HTMLElement;
  readonly intent: FormIntent;
  readonly confidence: number;
  readonly fields: readonly ClassifiedField[];
  readonly root: ScanRoot;
}

export interface Credential {
  readonly username?: string;
  readonly password?: string;
  readonly newPassword?: string;
}

export interface EngineEvents {
  onFormsChanged?(forms: readonly ClassifiedForm[]): void;
  onFieldFocused?(field: ClassifiedField, form: ClassifiedForm | null): void;
  onFormSubmitted?(form: ClassifiedForm, capturedValues: Readonly<Partial<Record<FieldRole, string>>>): void;
}

export interface EngineConfig {
  readonly debounceMs: number;
  readonly maxWaitMs: number;
  readonly minFieldScore: number;
  readonly maxIframeDepth: number;
}

export type ScanRoot = Document | ShadowRoot;

const DEFAULT_CONFIG: EngineConfig = {
  debounceMs: 150,
  maxWaitMs: 1000,
  minFieldScore: 2,
  maxIframeDepth: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic signal tables (weighted regex — order-independent, site-agnostic)
// ─────────────────────────────────────────────────────────────────────────────

interface Signal {
  readonly re: RegExp;
  readonly weight: number;
}

const sig = (re: RegExp, weight: number): Signal => ({ re, weight });

/** Poison terms: any field matching these is heavily penalized for every role. */
const NEGATIVE: readonly Signal[] = [
  sig(/search|query|captcha|coupon|promo|gift.?card|zip|postal|city|street|address|company|subject|comment|message/i, -6),
  sig(/card.?number|cvv|cvc|expir|iban|routing|account.?number/i, -6),
];

const SIGNALS: Readonly<Record<Exclude<FieldRole, 'unknown'>, readonly Signal[]>> = {
  username: [
    sig(/user.?name|login.?(id|name)?$|nick.?name|screen.?name|account.?(id|name)/i, 4),
    sig(/\b(user|login|identifier|handle|uid)\b/i, 3),
    sig(/member|customer.?(id|number)/i, 2),
  ],
  email: [
    sig(/e-?mail/i, 4),
    sig(/@/, 2), // placeholders like "name@example.com"
  ],
  'current-password': [
    sig(/current.?pass|old.?pass|existing.?pass|verify.?pass/i, 5),
    sig(/pass.?word|passwd|\bpwd\b|passphrase/i, 2),
  ],
  'new-password': [
    sig(/new.?pass|create.?pass|choose.?pass|set.?pass/i, 5),
    sig(/pass.?word|passwd|\bpwd\b|passphrase/i, 2),
  ],
  'confirm-password': [
    sig(/confirm|re.?(enter|type|peat)|again|verification|match/i, 4),
    sig(/pass.?word|passwd|\bpwd\b/i, 2),
  ],
  otp: [
    sig(/one.?time|otp|totp|2fa|mfa|verification.?code|security.?code|auth.?code|\bpin\b/i, 5),
    sig(/\bcode\b|token/i, 2),
  ],
};

/** Spec-defined autocomplete tokens — authoritative, bypass scoring entirely. */
const AUTOCOMPLETE_ROLES: Readonly<Record<string, FieldRole>> = {
  username: 'username',
  email: 'email',
  'current-password': 'current-password',
  'new-password': 'new-password',
  'one-time-code': 'otp',
};

/** Form-level text signals for intent tie-breaking (button labels, headings, form attrs). */
const INTENT_SIGNALS: Readonly<Record<Exclude<FormIntent, 'unknown'>, RegExp>> = {
  login: /log.?in|sign.?in|authenticate|welcome.?back/i,
  register: /register|sign.?up|create.?(an.?)?account|join|get.?started/i,
  'password-update': /change.?pass|update.?pass|edit.?pass/i,
  'password-reset': /reset|forgot|recover|restore/i,
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM utilities
// ─────────────────────────────────────────────────────────────────────────────

function isVisible(el: HTMLElement): boolean {
  if (el.hidden || (el as HTMLInputElement).type === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

function isFillable(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly) return false;
  return /^(text|email|password|tel|number|)$/i.test(input.type);
}

/** Resolve human-readable label text: <label for>, wrapping label, aria-labelledby, aria-label. */
function resolveLabelText(input: HTMLInputElement): string {
  const parts: string[] = [];
  input.labels?.forEach((l) => parts.push(l.textContent ?? ''));
  const wrapping = input.closest('label');
  if (wrapping) parts.push(wrapping.textContent ?? '');
  const labelledBy = input.getAttribute('aria-labelledby');
  if (labelledBy) {
    const root = input.getRootNode() as ScanRoot;
    for (const id of labelledBy.split(/\s+/)) parts.push(root.getElementById?.(id)?.textContent ?? '');
  }
  parts.push(input.getAttribute('aria-label') ?? '');
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Concatenated attribute corpus the regex signals run against. */
function buildCorpus(input: HTMLInputElement): string {
  return [
    input.name,
    input.id,
    input.placeholder,
    input.className,
    input.getAttribute('data-testid') ?? '',
    resolveLabelText(input),
  ]
    .join(' ')
    .slice(0, 400);
}

/**
 * Set a value so framework-controlled inputs (React/Vue/Angular) register it:
 * use the native prototype setter to defeat value-tracking, then dispatch
 * composed input/change events.
 */
export function setNativeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter ? setter.call(input, value) : (input.value = value);
  for (const type of ['input', 'change'] as const) {
    input.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
  }
}

/** Smallest common ancestor of a set of elements (fallback container for form-less clusters). */
function commonAncestor(elements: readonly HTMLElement[]): HTMLElement {
  let ancestor: HTMLElement = elements[0];
  for (let i = 1; i < elements.length; i++) {
    while (!ancestor.contains(elements[i])) {
      const parent = ancestor.parentElement ?? (ancestor.getRootNode() as ShadowRoot).host as HTMLElement | null;
      if (!parent) return (ancestor.ownerDocument?.body ?? ancestor) as HTMLElement;
      ancestor = parent;
    }
  }
  return ancestor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic Engine
// ─────────────────────────────────────────────────────────────────────────────

class HeuristicEngine {
  private readonly fieldCache = new WeakMap<HTMLInputElement, ClassifiedField>();
  /** Corpus snapshot used to invalidate cache entries when attributes change. */
  private readonly corpusCache = new WeakMap<HTMLInputElement, string>();

  constructor(private readonly config: EngineConfig) {}

  classifyField(input: HTMLInputElement): ClassifiedField {
    const corpus = buildCorpus(input);
    const cached = this.fieldCache.get(input);
    if (cached && this.corpusCache.get(input) === corpus && cached.element.type === input.type) {
      return cached;
    }
    const result = this.computeField(input, corpus);
    this.fieldCache.set(input, result);
    this.corpusCache.set(input, corpus);
    return result;
  }

  private computeField(input: HTMLInputElement, corpus: string): ClassifiedField {
    const visible = isVisible(input);

    // Tier 1: authoritative autocomplete token.
    const token = input.autocomplete?.trim().toLowerCase().split(/\s+/).pop() ?? '';
    const authoritative = AUTOCOMPLETE_ROLES[token];
    if (authoritative) return { element: input, role: authoritative, confidence: 1, visible };

    const isPassword = input.type === 'password';
    const roles: readonly FieldRole[] = isPassword
      ? ['current-password', 'new-password', 'confirm-password']
      : input.type === 'email'
        ? ['email']
        : ['username', 'email', 'otp'];

    let penalty = 0;
    for (const s of NEGATIVE) if (s.re.test(corpus)) penalty += s.weight;

    let bestRole: FieldRole = 'unknown';
    let bestScore = 0;
    for (const role of roles) {
      let score = penalty;
      for (const s of SIGNALS[role as Exclude<FieldRole, 'unknown'>]) if (s.re.test(corpus)) score += s.weight;
      if (score > bestScore) {
        bestScore = score;
        bestRole = role;
      }
    }

    // A bare password input with no markers is still a password — default to current-password;
    // ambiguity is resolved topologically at the form level.
    if (bestRole === 'unknown' && isPassword) {
      return { element: input, role: 'current-password', confidence: 0.4, visible };
    }
    // A bare email-typed input is an email even without name markers.
    if (bestRole === 'unknown' && input.type === 'email' && penalty === 0) {
      return { element: input, role: 'email', confidence: 0.6, visible };
    }
    if (bestScore < this.config.minFieldScore) {
      return { element: input, role: 'unknown', confidence: 0, visible };
    }
    return { element: input, role: bestRole, confidence: Math.min(bestScore / 8, 0.95), visible };
  }

  /**
   * Cluster fields into a logical form and infer intent.
   * Topology of password fields dominates; text signals only break ties.
   */
  classifyForm(fields: ClassifiedField[], container: HTMLElement, root: ScanRoot): ClassifiedForm {
    const resolved = this.resolvePasswordTopology(fields);
    const passwords = resolved.filter((f) => f.role.endsWith('password') && f.visible);
    const hasIdentity = resolved.some((f) => (f.role === 'username' || f.role === 'email') && f.visible);
    const hasCurrent = passwords.some((f) => f.role === 'current-password');
    const hasNew = passwords.some((f) => f.role === 'new-password');
    const hasConfirm = passwords.some((f) => f.role === 'confirm-password');

    const textHits = this.formTextHits(container);
    let intent: FormIntent = 'unknown';
    let confidence = 0.5;

    if (hasCurrent && hasNew) {
      intent = 'password-update';
      confidence = 0.9;
    } else if (hasNew || hasConfirm || passwords.length >= 2) {
      // No current password + new/confirm topology → register or reset.
      intent = textHits.has('password-reset') || !hasIdentity ? 'password-reset' : 'register';
      confidence = textHits.size > 0 ? 0.85 : 0.7;
    } else if (passwords.length === 1) {
      if (textHits.has('register')) {
        intent = 'register'; // single-password signup
        confidence = 0.75;
      } else {
        intent = 'login';
        confidence = hasIdentity ? 0.85 : 0.6;
      }
    } else if (hasIdentity && textHits.has('password-reset')) {
      intent = 'password-reset'; // email-only "forgot password" step
      confidence = 0.7;
    } else if (hasIdentity) {
      intent = textHits.has('register') ? 'register' : 'login'; // multi-step identifier-first flow
      confidence = 0.55;
    }

    return { container, intent, confidence, fields: resolved, root };
  }

  /**
   * Relational pass over password fields: singletons stay as classified; in pairs/triples,
   * an unmarked field following a new-password is a confirm; current precedes new.
   */
  private resolvePasswordTopology(fields: ClassifiedField[]): ClassifiedField[] {
    const pw = fields.filter((f) => f.element.type === 'password' && f.visible);
    if (pw.length < 2) return fields;

    const reassign = new Map<HTMLInputElement, FieldRole>();
    if (pw.length === 2) {
      const [a, b] = pw;
      if (a.role === 'current-password' && b.role === 'current-password' && a.confidence <= 0.4 && b.confidence <= 0.4) {
        // Two unmarked passwords: new + confirm (register/reset pattern).
        reassign.set(a.element, 'new-password');
        reassign.set(b.element, 'confirm-password');
      } else if (b.role !== 'confirm-password' && (a.role === 'new-password' || b.role === a.role)) {
        reassign.set(b.element, 'confirm-password');
      }
    } else if (pw.length >= 3) {
      reassign.set(pw[0].element, pw[0].confidence >= 0.6 ? pw[0].role : 'current-password');
      reassign.set(pw[1].element, 'new-password');
      reassign.set(pw[2].element, 'confirm-password');
    }

    return fields.map((f) => {
      const role = reassign.get(f.element);
      return role && role !== f.role ? { ...f, role, confidence: Math.max(f.confidence, 0.7) } : f;
    });
  }

  private formTextHits(container: HTMLElement): Set<FormIntent> {
    const parts: string[] = [container.getAttribute('id') ?? '', container.getAttribute('name') ?? ''];
    if (container instanceof HTMLFormElement) parts.push(container.action ?? '');
    container
      .querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"], h1, h2, legend')
      .forEach((el, i) => {
        if (i < 8) parts.push((el.textContent ?? (el as HTMLInputElement).value ?? '').slice(0, 80));
      });
    const text = parts.join(' ');
    const hits = new Set<FormIntent>();
    for (const [intent, re] of Object.entries(INTENT_SIGNALS)) if (re.test(text)) hits.add(intent as FormIntent);
    return hits;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Root registry + traversal (Shadow DOM / iframe piercing)
// ─────────────────────────────────────────────────────────────────────────────

interface ScanResult {
  readonly inputs: HTMLInputElement[];
  readonly newRoots: ScanRoot[];
}

class RootRegistry {
  private readonly known = new Set<ScanRoot>();

  has(root: ScanRoot): boolean {
    return this.known.has(root);
  }

  add(root: ScanRoot): void {
    this.known.add(root);
  }

  /** Removes stale roots (detached shadow hosts, torn-down documents) and returns them for cleanup. */
  prune(): ScanRoot[] {
    const removed: ScanRoot[] = [];
    for (const root of this.known) {
      const doc = root instanceof Document ? root : root.host.ownerDocument;
      if (!doc || (root instanceof ShadowRoot && !root.host.isConnected)) {
        this.known.delete(root);
        removed.push(root);
      }
    }
    return removed;
  }

  all(): readonly ScanRoot[] {
    return [...this.known];
  }

  /**
   * Iterative traversal of one root: collects fillable inputs, discovers open
   * shadow roots and same-origin iframe documents. Explicit stack — no recursion
   * limits, trivially time-sliceable.
   */
  scan(root: ScanRoot, maxIframeDepth: number, iframeDepth = 0): ScanResult {
    const inputs: HTMLInputElement[] = [];
    const newRoots: ScanRoot[] = [];
    const stack: Element[] = [];
    const seed = root instanceof Document ? root.documentElement : null;
    if (seed) stack.push(seed);
    else for (let c = root.firstElementChild; c; c = c.nextElementSibling) stack.push(c);

    while (stack.length > 0) {
      const el = stack.pop() as Element;

      if (el instanceof HTMLInputElement) {
        if (isFillable(el)) inputs.push(el);
      } else if (el instanceof HTMLIFrameElement && iframeDepth < maxIframeDepth) {
        // Same-origin only; cross-origin frames run their own engine via all_frames injection.
        let doc: Document | null = null;
        try {
          doc = el.contentDocument;
        } catch {
          doc = null;
        }
        if (doc && !this.known.has(doc)) newRoots.push(doc);
      }

      const shadow = el.shadowRoot; // open roots only; closed are unreachable by design
      if (shadow && !this.known.has(shadow)) newRoots.push(shadow);

      // Skip subtrees that can never contain fields.
      if (!/^(SCRIPT|STYLE|SVG|CANVAS|VIDEO|AUDIO|TEMPLATE)$/.test(el.tagName)) {
        for (let c = el.lastElementChild; c; c = c.previousElementSibling) stack.push(c);
      }
    }
    return { inputs, newRoots };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation Lifecycle Manager
// ─────────────────────────────────────────────────────────────────────────────

const RELEVANT_ATTRS = ['type', 'autocomplete', 'name', 'id', 'disabled', 'readonly', 'hidden', 'style', 'class'];

class MutationLifecycle {
  private readonly observers = new WeakMap<ScanRoot, MutationObserver>();
  private readonly observedRoots = new WeakSet<ScanRoot>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private idleHandle: number | null = null;

  constructor(
    private readonly config: EngineConfig,
    private readonly onRescan: () => void,
  ) {}

  observe(root: ScanRoot): void {
    if (this.observedRoots.has(root)) return;
    this.observedRoots.add(root);
    const observer = new MutationObserver((mutations) => {
      // Zero DOM reads here — only relevance filtering, then schedule.
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length === 0 && m.removedNodes.length === 0) continue;
        this.schedule();
        return;
      }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: RELEVANT_ATTRS,
    });
    this.observers.set(root, observer);
  }

  /** Trailing-edge debounce with a max-wait ceiling so mutation storms still get scanned. */
  private schedule(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), this.config.debounceMs);
    if (this.maxWaitTimer === null) {
      this.maxWaitTimer = setTimeout(() => this.flush(), this.config.maxWaitMs);
    }
  }

  private flush(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer !== null) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
    if (this.idleHandle !== null) return; // rescan already queued

    const run = (): void => {
      this.idleHandle = null;
      this.onRescan();
    };
    this.idleHandle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(run, { timeout: 500 })
        : (setTimeout(run, 0) as unknown as number);
  }

  disconnect(root: ScanRoot): void {
    this.observers.get(root)?.disconnect();
  }

  dispose(roots: readonly ScanRoot[]): void {
    for (const root of roots) this.disconnect(root);
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer !== null) clearTimeout(this.maxWaitTimer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Interceptor
// ─────────────────────────────────────────────────────────────────────────────

class EventInterceptor {
  private readonly attached = new WeakSet<ScanRoot>();
  private readonly listeners: Array<{ root: ScanRoot; type: string; fn: EventListener }> = [];

  constructor(
    private readonly resolveField: (el: HTMLInputElement) => ClassifiedField | null,
    private readonly resolveForm: (el: HTMLInputElement) => ClassifiedForm | null,
    private readonly events: EngineEvents,
  ) {}

  attach(root: ScanRoot): void {
    if (this.attached.has(root)) return;
    this.attached.add(root);
    this.on(root, 'focusin', (e) => this.handleFocus(e));
    this.on(root, 'input', (e) => this.handleInput(e));
    this.on(root, 'submit', (e) => this.handleSubmit(e));
  }

  private on(root: ScanRoot, type: string, fn: EventListener): void {
    root.addEventListener(type, fn, { capture: true, passive: true });
    this.listeners.push({ root, type, fn });
  }

  /** Recover the true target through shadow boundaries. */
  private target(e: Event): HTMLInputElement | null {
    const t = e.composedPath()[0] ?? e.target;
    return t instanceof HTMLInputElement ? t : null;
  }

  private handleFocus(e: Event): void {
    const input = this.target(e);
    if (!input || !isFillable(input)) return;
    const field = this.resolveField(input);
    if (field && field.role !== 'unknown') {
      this.events.onFieldFocused?.(field, this.resolveForm(input));
    }
  }

  private handleInput(e: Event): void {
    const input = this.target(e);
    if (!input || input.type !== 'password') return;
    // Password typing inside an unclassified container ⇒ heuristics missed a
    // dynamically built form; force reconciliation via the form resolver.
    this.resolveForm(input);
  }

  private handleSubmit(e: Event): void {
    const path = e.composedPath();
    const formEl = path.find((n): n is HTMLFormElement => n instanceof HTMLFormElement);
    if (!formEl) return;
    const anyInput = formEl.querySelector<HTMLInputElement>('input');
    const form = anyInput ? this.resolveForm(anyInput) : null;
    if (!form) return;

    // Snapshot values at submit time for save/update prompts (never persisted here).
    const captured: Partial<Record<FieldRole, string>> = {};
    for (const f of form.fields) {
      if (f.role !== 'unknown' && f.element.value) captured[f.role] = f.element.value;
    }
    this.events.onFormSubmitted?.(form, captured);
  }

  dispose(): void {
    for (const { root, type, fn } of this.listeners) {
      root.removeEventListener(type, fn, { capture: true });
    }
    this.listeners.length = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AutofillEngine — public facade
// ─────────────────────────────────────────────────────────────────────────────

export class AutofillEngine {
  private readonly config: EngineConfig;
  private readonly registry = new RootRegistry();
  private readonly heuristics: HeuristicEngine;
  private readonly lifecycle: MutationLifecycle;
  private readonly interceptor: EventInterceptor;
  private readonly formByContainer = new WeakMap<HTMLElement, ClassifiedForm>();
  private forms: ClassifiedForm[] = [];
  private started = false;

  constructor(
    private readonly events: EngineEvents = {},
    config: Partial<EngineConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.heuristics = new HeuristicEngine(this.config);
    this.lifecycle = new MutationLifecycle(this.config, () => this.rescan());
    this.interceptor = new EventInterceptor(
      (el) => this.heuristics.classifyField(el),
      (el) => this.formFor(el),
      this.events,
    );
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.adoptRoot(document);
    this.rescan();
  }

  stop(): void {
    this.started = false;
    this.lifecycle.dispose(this.registry.all());
    this.interceptor.dispose();
    this.forms = [];
  }

  getForms(): readonly ClassifiedForm[] {
    return this.forms;
  }

  /** Fill a classified form with a credential, honoring per-role targets. */
  fill(form: ClassifiedForm, credential: Credential): boolean {
    let filled = false;
    for (const field of form.fields) {
      if (!field.visible || !field.element.isConnected) continue;
      const value = this.valueFor(field.role, credential);
      if (value !== undefined) {
        setNativeValue(field.element, value);
        filled = true;
      }
    }
    return filled;
  }

  private valueFor(role: FieldRole, c: Credential): string | undefined {
    switch (role) {
      case 'username':
      case 'email':
        return c.username;
      case 'current-password':
        return c.password;
      case 'new-password':
      case 'confirm-password':
        return c.newPassword ?? c.password;
      default:
        return undefined;
    }
  }

  private adoptRoot(root: ScanRoot): void {
    if (this.registry.has(root)) return;
    this.registry.add(root);
    this.lifecycle.observe(root);
    this.interceptor.attach(root);
  }

  /** Full reconciliation pass: scoped to registered roots, results diffed before emit. */
  private rescan(): void {
    if (!this.started) return;
    // Explicit disconnect is required: an active MutationObserver holds a strong
    // internal reference to its observed node, which would otherwise prevent GC
    // of detached shadow roots even though nothing in JS-land points to them anymore.
    for (const stale of this.registry.prune()) this.lifecycle.disconnect(stale);

    const allInputs: HTMLInputElement[] = [];
    const queue: ScanRoot[] = [...this.registry.all()];
    while (queue.length > 0) {
      const root = queue.shift() as ScanRoot;
      const { inputs, newRoots } = this.registry.scan(root, this.config.maxIframeDepth);
      allInputs.push(...inputs);
      for (const nr of newRoots) {
        this.adoptRoot(nr);
        queue.push(nr);
      }
    }

    const nextForms = this.buildForms(allInputs);
    if (this.formsChanged(nextForms)) {
      this.forms = nextForms;
      for (const form of nextForms) this.formByContainer.set(form.container, form);
      this.events.onFormsChanged?.(nextForms);
    }
  }

  private buildForms(inputs: HTMLInputElement[]): ClassifiedForm[] {
    // Cluster by owning <form>; form-less fields grouped per root, container = common ancestor.
    const byForm = new Map<HTMLFormElement, ClassifiedField[]>();
    const orphansByRoot = new Map<ScanRoot, ClassifiedField[]>();

    for (const input of inputs) {
      const field = this.heuristics.classifyField(input);
      if (field.role === 'unknown' && input.type !== 'password') continue;
      const owner = input.form;
      if (owner) {
        (byForm.get(owner) ?? byForm.set(owner, []).get(owner)!).push(field);
      } else {
        const root = input.getRootNode() as ScanRoot;
        (orphansByRoot.get(root) ?? orphansByRoot.set(root, []).get(root)!).push(field);
      }
    }

    const forms: ClassifiedForm[] = [];
    for (const [formEl, fields] of byForm) {
      forms.push(this.heuristics.classifyForm(fields, formEl, formEl.getRootNode() as ScanRoot));
    }
    for (const [root, fields] of orphansByRoot) {
      const elements = fields.map((f) => f.element);
      forms.push(this.heuristics.classifyForm(fields, commonAncestor(elements), root));
    }
    return forms.filter((f) => f.intent !== 'unknown' || f.fields.some((x) => x.element.type === 'password'));
  }

  private formFor(input: HTMLInputElement): ClassifiedForm | null {
    for (const form of this.forms) {
      if (form.fields.some((f) => f.element === input)) return form;
    }
    // Unknown input inside a known container ⇒ stale state; reconcile immediately.
    this.rescan();
    return this.forms.find((form) => form.fields.some((f) => f.element === input)) ?? null;
  }

  private formsChanged(next: ClassifiedForm[]): boolean {
    if (next.length !== this.forms.length) return true;
    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      const b = this.forms[i];
      if (a.container !== b.container || a.intent !== b.intent || a.fields.length !== b.fields.length) return true;
      for (let j = 0; j < a.fields.length; j++) {
        if (a.fields[j].element !== b.fields[j].element || a.fields[j].role !== b.fields[j].role) return true;
      }
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap (content-script entry — wire events to the extension runtime here)
// ─────────────────────────────────────────────────────────────────────────────

export function bootstrapAutofillEngine(events: EngineEvents = {}): AutofillEngine {
  const engine = new AutofillEngine(events);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => engine.start(), { once: true });
  } else {
    engine.start();
  }
  return engine;
}
