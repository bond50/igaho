// features/auth/utils/rate-limit.ts
import {headers} from 'next/headers';
import {RateLimiterMemory, RateLimiterPrisma} from 'rate-limiter-flexible';
import {db} from '@/lib/db';

type LimitResult = {
    consumedPoints: number;
    isFirstInDuration: boolean;
    msBeforeNext: number;
    remainingPoints: number;
};

type RateLimiterClient = {
    consume: (key: string, points?: number) => Promise<LimitResult>;
};

interface LoginLock {
    step: number;
    lockedUntil: number;
}

const LOCK_STEPS_MS: readonly number[] = [
    60_000,
    5 * 60_000,
    15 * 60_000,
    30 * 60_000,
    60 * 60_000,
    3 * 60 * 60_000,
    24 * 60 * 60_000,
    7 * 24 * 60 * 60_000,
];

const LOGIN_MAX = 3;
const LOGIN_WINDOW_SECONDS = 60;
const LOGIN_IP_MAX = 30;
const LOGIN_IP_WINDOW_SECONDS = 60;
const MFA_MAX = 30;
const MFA_WINDOW_SECONDS = 10 * 60;
const AUTHAPI_MAX = 30;
const AUTHAPI_WINDOW_SECONDS = 60;

const memLoginAcct = new RateLimiterMemory({
    keyPrefix: 'rl:login:acct',
    points: LOGIN_MAX,
    duration: LOGIN_WINDOW_SECONDS,
});

const memLoginIP = new RateLimiterMemory({
    keyPrefix: 'rl:login:ip',
    points: LOGIN_IP_MAX,
    duration: LOGIN_IP_WINDOW_SECONDS,
});

const mem2FA = new RateLimiterMemory({
    keyPrefix: 'rl:2fa',
    points: MFA_MAX,
    duration: MFA_WINDOW_SECONDS,
});

const memAuthAPI = new RateLimiterMemory({
    keyPrefix: 'rl:authapi',
    points: AUTHAPI_MAX,
    duration: AUTHAPI_WINDOW_SECONDS,
});

const memLoginLocks = new Map<string, LoginLock>();

let useFallback = true;
let initialized = false;
let prismaLoginAcct: RateLimiterClient | null = null;
let prismaLoginIP: RateLimiterClient | null = null;
let prisma2FA: RateLimiterClient | null = null;
let prismaAuthAPI: RateLimiterClient | null = null;

function computeNextLock(prev: LoginLock | null, now: number): LoginLock {
    const prevStep = prev?.step ?? -1;
    const nextStep = Math.min(prevStep + 1, LOCK_STEPS_MS.length - 1);
    const durationMs = LOCK_STEPS_MS[nextStep];

    return {
        step: nextStep,
        lockedUntil: now + durationMs,
    };
}

function remainingMs(lock: LoginLock | null, now: number): number {
    if (!lock) return 0;
    return Math.max(0, lock.lockedUntil - now);
}

function normalizeRejectedResult(error: unknown): number {
    if (typeof error === 'object' && error !== null && 'msBeforeNext' in error) {
        const msBeforeNext = error.msBeforeNext;
        if (typeof msBeforeNext === 'number' && Number.isFinite(msBeforeNext)) {
            return Math.max(1, Math.ceil(msBeforeNext));
        }
    }

    throw error instanceof Error ? error : new Error('Rate limiter failed');
}

async function consume(
    limiter: RateLimiterClient,
    key: string,
): Promise<{ ok: true } | { ok: false; msBeforeNext: number }> {
    try {
        await limiter.consume(key);
        return {ok: true};
    } catch (error) {
        return {ok: false, msBeforeNext: normalizeRejectedResult(error)};
    }
}

function getStoredMemLoginLock(acctKey: string): LoginLock | null {
    return memLoginLocks.get(acctKey) ?? null;
}

function applyMemLoginLock(acctKey: string, prev: LoginLock | null, now: number): LoginLock {
    const next = computeNextLock(prev, now);
    memLoginLocks.set(acctKey, next);
    return next;
}

async function getStoredDbLoginLock(acctKey: string): Promise<LoginLock | null> {
    const lock = await db.loginRateLimitLock.findUnique({
        where: {accountKey: acctKey},
        select: {
            step: true,
            lockedUntil: true,
        },
    });

    if (!lock) return null;

    return {
        step: lock.step,
        lockedUntil: lock.lockedUntil.getTime(),
    };
}

async function applyDbLoginLock(
    acctKey: string,
    prev: LoginLock | null,
    now: number,
): Promise<LoginLock> {
    const next = computeNextLock(prev, now);

    await db.loginRateLimitLock.upsert({
        where: {accountKey: acctKey},
        create: {
            accountKey: acctKey,
            step: next.step,
            lockedUntil: new Date(next.lockedUntil),
        },
        update: {
            step: next.step,
            lockedUntil: new Date(next.lockedUntil),
        },
    });

    return next;
}

async function ensureInit(): Promise<void> {
    if (initialized) return;
    initialized = true;

    try {
        prismaLoginAcct = new RateLimiterPrisma({
            storeClient: db,
            keyPrefix: 'rl:login:acct',
            points: LOGIN_MAX,
            duration: LOGIN_WINDOW_SECONDS,
        });

        prismaLoginIP = new RateLimiterPrisma({
            storeClient: db,
            keyPrefix: 'rl:login:ip',
            points: LOGIN_IP_MAX,
            duration: LOGIN_IP_WINDOW_SECONDS,
        });

        prisma2FA = new RateLimiterPrisma({
            storeClient: db,
            keyPrefix: 'rl:2fa',
            points: MFA_MAX,
            duration: MFA_WINDOW_SECONDS,
        });

        prismaAuthAPI = new RateLimiterPrisma({
            storeClient: db,
            keyPrefix: 'rl:authapi',
            points: AUTHAPI_MAX,
            duration: AUTHAPI_WINDOW_SECONDS,
        });

        useFallback = false;
    } catch {
        useFallback = true;
    }
}

async function getIPFromHeaders(): Promise<string> {
    const h = await headers();
    const xff = h.get('x-forwarded-for');
    if (xff) return xff.split(',')[0]!.trim();
    return h.get('x-real-ip') ?? 'ip:unknown';
}

export async function assertNotRateLimitedLogin(email: string): Promise<void> {
    await ensureInit();
    const ip = await getIPFromHeaders();
    const keyIP = `ip:${ip}`;
    const acctKey = email.toLowerCase();
    const now = Date.now();

    if (useFallback) {
        const storedLock = getStoredMemLoginLock(acctKey);
        const lockMs = remainingMs(storedLock, now);
        if (lockMs > 0) {
            throw new Error(`rate_limited:${lockMs}`);
        }

        const acctRes = await consume(memLoginAcct, `acct:${acctKey}`);
        if (!acctRes.ok) {
            const next = applyMemLoginLock(acctKey, storedLock, now);
            throw new Error(`rate_limited:${remainingMs(next, now)}`);
        }

        const ipRes = await consume(memLoginIP, keyIP);
        if (!ipRes.ok) {
            throw new Error(`rate_limited:${Math.max(LOGIN_IP_WINDOW_SECONDS * 1000, ipRes.msBeforeNext)}`);
        }

        return;
    }

    const storedLock = await getStoredDbLoginLock(acctKey);
    const lockMs = remainingMs(storedLock, now);
    if (lockMs > 0) {
        throw new Error(`rate_limited:${lockMs}`);
    }

    const acctRes = await consume(prismaLoginAcct!, `acct:${acctKey}`);
    if (!acctRes.ok) {
        const next = await applyDbLoginLock(acctKey, storedLock, now);
        throw new Error(`rate_limited:${remainingMs(next, now)}`);
    }

    const ipRes = await consume(prismaLoginIP!, keyIP);
    if (!ipRes.ok) {
        throw new Error(`rate_limited:${Math.max(LOGIN_IP_WINDOW_SECONDS * 1000, ipRes.msBeforeNext)}`);
    }
}

export async function assertNotRateLimited2FA(email: string): Promise<void> {
    await ensureInit();
    const keyAcct = `acct:${email.toLowerCase()}`;

    const limiter = useFallback ? mem2FA : prisma2FA!;
    const result = await consume(limiter, keyAcct);
    if (!result.ok) throw new Error('rate_limited');
}

export async function assertNotRateLimitedAuthAPI(ipOverride?: string): Promise<void> {
    await ensureInit();
    const ip = ipOverride ?? (await getIPFromHeaders());
    const keyIP = `ip:${ip}`;

    const limiter = useFallback ? memAuthAPI : prismaAuthAPI!;
    const result = await consume(limiter, keyIP);
    if (!result.ok) throw new Error('rate_limited');
}

export async function clearLoginLockOnSuccess(email: string): Promise<void> {
    const acctKey = email.toLowerCase();
    memLoginLocks.delete(acctKey);

    await ensureInit();
    if (!useFallback) {
        await db.loginRateLimitLock.deleteMany({
            where: {accountKey: acctKey},
        });
    }
}
