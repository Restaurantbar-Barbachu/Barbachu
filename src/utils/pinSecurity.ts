const PBKDF2_PREFIX = 'pbkdf2_sha256';
const PBKDF2_ITERATIONS = 10000;
const PIN_REGEX = /^\d{4}$/;

export function isValidFourDigitPin(pin: string): boolean {
  return PIN_REGEX.test(String(pin || '').trim());
}

export function isWeakDefaultPin(pin: string): boolean {
  const clean = String(pin || '').trim();
  return clean === '0000';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function randomSaltHex(byteLen = 16): string {
  const buf = new Uint8Array(byteLen);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < byteLen; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToHex(buf);
}

async function derivePbkdf2Hex(
  pin: string,
  saltHex: string,
  iterations: number
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const saltBytes = hexToBytes(saltHex);
  if (!subtle || !saltBytes) {
    throw new Error('Web Crypto API no disponible para derivar hash de PIN.');
  }
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

export async function hashPin(pin: string, explicitSaltHex?: string): Promise<string> {
  const cleanPin = String(pin || '').trim();
  if (!isValidFourDigitPin(cleanPin)) {
    throw new Error('El PIN debe contener exactamente 4 dígitos numéricos.');
  }
  const saltHex = explicitSaltHex || randomSaltHex(16);
  const hashHex = await derivePbkdf2Hex(cleanPin, saltHex, PBKDF2_ITERATIONS);
  return `${PBKDF2_PREFIX}$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

export async function verifyPinSecret(
  enteredPin: string,
  storedPinHash?: string | null,
  legacyPlaintextPin?: string | null
): Promise<boolean> {
  const cleanPin = String(enteredPin || '').trim();
  if (!isValidFourDigitPin(cleanPin)) return false;

  const cleanHash = String(storedPinHash || '').trim();
  if (cleanHash.startsWith(`${PBKDF2_PREFIX}$`)) {
    const parts = cleanHash.split('$');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    const saltHex = parts[2];
    const expectedHex = parts[3];
    if (!Number.isInteger(iterations) || iterations < 1000 || !saltHex || !expectedHex) {
      return false;
    }
    try {
      const candidateHex = await derivePbkdf2Hex(cleanPin, saltHex, iterations);
      return constantTimeEqual(candidateHex, expectedHex);
    } catch {
      return false;
    }
  }

  // Legacy migration support for pre-existing 4-digit unhashed documents (never accepts masked sentinel)
  const cleanLegacy = String(legacyPlaintextPin || '').trim();
  if (isValidFourDigitPin(cleanLegacy)) {
    return constantTimeEqual(cleanPin, cleanLegacy);
  }
  return false;
}

export interface RateLimitState {
  failures: number;
  lockoutLevel: number;
  lockedUntilMs: number;
}

export interface RateLimitStatus {
  blocked: boolean;
  remainingMs: number;
  failures: number;
  attemptsLeft: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000;
const RATE_LIMIT_PREFIX = 'barbachu.pin.rl.v1.';

export class PinRateLimiter {
  private readonly maxAttempts: number;
  private readonly baseLockoutMs: number;
  private readonly memory = new Map<string, RateLimitState>();
  private readonly storage?: Storage;

  constructor(options?: { maxAttempts?: number; baseLockoutMs?: number; storage?: Storage }) {
    this.maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseLockoutMs = options?.baseLockoutMs ?? BASE_LOCKOUT_MS;
    if (options?.storage) {
      this.storage = options.storage;
    } else if (typeof window !== 'undefined') {
      try {
        this.storage = window.sessionStorage;
      } catch {
        this.storage = undefined;
      }
    }
  }

  private readState(scope: string): RateLimitState {
    if (this.storage) {
      try {
        const raw = this.storage.getItem(RATE_LIMIT_PREFIX + scope);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<RateLimitState>;
          return {
            failures: Number(parsed.failures) || 0,
            lockoutLevel: Number(parsed.lockoutLevel) || 0,
            lockedUntilMs: Number(parsed.lockedUntilMs) || 0,
          };
        }
      } catch {
        // fallback to memory map
      }
    }
    return this.memory.get(scope) || { failures: 0, lockoutLevel: 0, lockedUntilMs: 0 };
  }

  private writeState(scope: string, state: RateLimitState): void {
    this.memory.set(scope, state);
    if (this.storage) {
      try {
        this.storage.setItem(RATE_LIMIT_PREFIX + scope, JSON.stringify(state));
      } catch {
        // ignore quota errors
      }
    }
  }

  check(scope: string, nowMs = Date.now()): RateLimitStatus {
    const state = this.readState(scope);
    if (state.lockedUntilMs > nowMs) {
      return {
        blocked: true,
        remainingMs: state.lockedUntilMs - nowMs,
        failures: state.failures,
        attemptsLeft: 0,
      };
    }
    const effectiveFailures = state.lockedUntilMs > 0 && state.lockedUntilMs <= nowMs ? 0 : state.failures;
    return {
      blocked: false,
      remainingMs: 0,
      failures: effectiveFailures,
      attemptsLeft: Math.max(0, this.maxAttempts - effectiveFailures),
    };
  }

  recordFailure(scope: string, nowMs = Date.now()): RateLimitStatus {
    const prev = this.readState(scope);
    if (prev.lockedUntilMs > nowMs) {
      return this.check(scope, nowMs);
    }
    const baseFailures = prev.lockedUntilMs > 0 && prev.lockedUntilMs <= nowMs ? 0 : prev.failures;
    const nextFailures = baseFailures + 1;
    if (nextFailures >= this.maxAttempts) {
      const nextLevel = prev.lockoutLevel + 1;
      const multiplier = Math.min(4, 2 ** (nextLevel - 1));
      const lockoutMs = this.baseLockoutMs * multiplier;
      const nextState: RateLimitState = {
        failures: nextFailures,
        lockoutLevel: nextLevel,
        lockedUntilMs: nowMs + lockoutMs,
      };
      this.writeState(scope, nextState);
      return {
        blocked: true,
        remainingMs: lockoutMs,
        failures: nextFailures,
        attemptsLeft: 0,
      };
    }
    const nextState: RateLimitState = {
      failures: nextFailures,
      lockoutLevel: prev.lockoutLevel,
      lockedUntilMs: 0,
    };
    this.writeState(scope, nextState);
    return {
      blocked: false,
      remainingMs: 0,
      failures: nextFailures,
      attemptsLeft: Math.max(0, this.maxAttempts - nextFailures),
    };
  }

  reset(scope: string): void {
    this.memory.delete(scope);
    if (this.storage) {
      try {
        this.storage.removeItem(RATE_LIMIT_PREFIX + scope);
      } catch {
        // ignore
      }
    }
  }
}

export const sharedPinRateLimiter = new PinRateLimiter();
