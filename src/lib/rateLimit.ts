/**
 * Simple in-memory rate limiter for API routes.
 * Uses a sliding window approach with per-user request tracking.
 *
 * Note: In-memory means limits reset on cold starts (Vercel serverless).
 * This is acceptable — it prevents abuse during active sessions without
 * requiring external infrastructure (Redis/KV).
 */

interface RateLimitEntry {
    timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;

    const cutoff = now - windowMs;
    for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter(t => t > cutoff);
        if (entry.timestamps.length === 0) {
            store.delete(key);
        }
    }
}

interface RateLimitConfig {
    /** Maximum number of requests allowed in the window */
    maxRequests: number;
    /** Time window in milliseconds */
    windowMs: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetMs: number;
}

/**
 * Check if a request from the given key (usually uid) is within rate limits.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const cutoff = now - config.windowMs;

    cleanup(config.windowMs);

    let entry = store.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);

    if (entry.timestamps.length >= config.maxRequests) {
        const oldestInWindow = entry.timestamps[0];
        return {
            allowed: false,
            remaining: 0,
            resetMs: oldestInWindow + config.windowMs - now,
        };
    }

    entry.timestamps.push(now);
    return {
        allowed: true,
        remaining: config.maxRequests - entry.timestamps.length,
        resetMs: config.windowMs,
    };
}

/**
 * Returns a 429 Too Many Requests response.
 */
export function rateLimitResponse(resetMs: number) {
    const retryAfterSec = Math.ceil(resetMs / 1000);
    return Response.json(
        { error: 'Too many requests. Please slow down.', retryAfter: retryAfterSec },
        {
            status: 429,
            headers: { 'Retry-After': String(retryAfterSec) },
        }
    );
}

// Pre-configured rate limits for specific routes
export const RATE_LIMITS = {
    mirror: { maxRequests: 10, windowMs: 60_000 },       // 10 per minute
    compile: { maxRequests: 3, windowMs: 3_600_000 },     // 3 per hour
    avatar: { maxRequests: 3, windowMs: 3_600_000 },      // 3 per hour
} as const;
