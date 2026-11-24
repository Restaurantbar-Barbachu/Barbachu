import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPin,
  isValidFourDigitPin,
  isWeakDefaultPin,
  PinRateLimiter,
  verifyPinSecret,
} from './pinSecurity';

describe('PIN format and weak PIN helpers', () => {
  it('validates 4-digit numeric PINs strictly', () => {
    assert.equal(isValidFourDigitPin('1234'), true);
    assert.equal(isValidFourDigitPin('0000'), true);
    assert.equal(isValidFourDigitPin('123'), false);
    assert.equal(isValidFourDigitPin('12345'), false);
    assert.equal(isValidFourDigitPin('12a4'), false);
    assert.equal(isValidFourDigitPin('****'), false);
  });

  it('flags 0000 as weak default PIN', () => {
    assert.equal(isWeakDefaultPin('0000'), true);
    assert.equal(isWeakDefaultPin('4829'), false);
  });
});

describe('PBKDF2 PIN hashing and verification', () => {
  it('hashes with salted PBKDF2-SHA256 and verifies matching PIN', async () => {
    const h1 = await hashPin('4927');
    const h2 = await hashPin('4927');
    assert.equal(h1.startsWith('pbkdf2_sha256$10000$'), true);
    assert.notEqual(h1, h2);
    assert.equal(await verifyPinSecret('4927', h1), true);
    assert.equal(await verifyPinSecret('4928', h1), false);
    assert.equal(await verifyPinSecret('****', h1), false);
  });

  it('rejects masked sentinel even when legacy plaintext fallback is empty or masked', async () => {
    assert.equal(await verifyPinSecret('0000', undefined, '****'), false);
    assert.equal(await verifyPinSecret('1357', undefined, '1357'), true);
    assert.equal(await verifyPinSecret('1358', undefined, '1357'), false);
  });
});

describe('PinRateLimiter', () => {
  it('blocks after max attempts with progressive cooldown and clears on reset', () => {
    const limiter = new PinRateLimiter({ maxAttempts: 3, baseLockoutMs: 10_000 });
    const scope = 'test-user';

    assert.equal(limiter.check(scope, 1000).blocked, false);
    assert.equal(limiter.recordFailure(scope, 1000).attemptsLeft, 2);
    assert.equal(limiter.recordFailure(scope, 2000).attemptsLeft, 1);

    const locked = limiter.recordFailure(scope, 3000);
    assert.equal(locked.blocked, true);
    assert.equal(locked.remainingMs, 10_000);

    // Still blocked inside cooldown window
    const duringCooldown = limiter.check(scope, 8000);
    assert.equal(duringCooldown.blocked, true);
    assert.equal(duringCooldown.remainingMs, 5_000);

    // Unblocked after cooldown expires
    assert.equal(limiter.check(scope, 14_000).blocked, false);

    // Second lockout doubles to 20s
    limiter.recordFailure(scope, 14_000);
    limiter.recordFailure(scope, 14_100);
    const secondLock = limiter.recordFailure(scope, 14_200);
    assert.equal(secondLock.blocked, true);
    assert.equal(secondLock.remainingMs, 20_000);

    // Successful auth resets state
    limiter.reset(scope);
    const afterReset = limiter.check(scope, 15_000);
    assert.equal(afterReset.blocked, false);
    assert.equal(afterReset.attemptsLeft, 3);
  });
});
