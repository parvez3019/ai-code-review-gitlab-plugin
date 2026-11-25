/** Retry helper shared by the AI providers and the GitLab client. */

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Tunables, exported so tests can shorten the waits. */
export const retryDefaults = {
    retries: 4,
    baseDelayMs: 2000,
    maxDelayMs: 60_000,
};

const RETRYABLE_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE']);

/** HTTP status of an error from axios, the Anthropic SDK or the AWS SDK. */
export function statusOf(error: any): number | undefined {
    return error?.response?.status ?? error?.status ?? error?.$metadata?.httpStatusCode;
}

/** For non-idempotent requests: only retry when the server certainly did nothing. */
export const isRateLimit = (error: unknown): boolean => statusOf(error) === 429;

export function isRetryable(error: any): boolean {
    const status = statusOf(error);
    if (status !== undefined) {
        return status === 408 || status === 429 || (status >= 500 && status !== 501);
    }
    if (error?.name === 'ThrottlingException' || error?.name === 'APIConnectionError' || error?.name === 'APIConnectionTimeoutError') {
        return true;
    }
    return RETRYABLE_NETWORK_CODES.has(error?.code);
}

/** Seconds from a Retry-After header, if the server sent one. */
function retryAfterMs(error: any): number | undefined {
    const headers = error?.response?.headers ?? error?.headers;
    const raw = typeof headers?.get === 'function' ? headers.get('retry-after') : headers?.['retry-after'];
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * Run `operation`, retrying rate limits, server errors and network failures with
 * exponential backoff and jitter. Other errors (400, 401, 404...) are thrown at once.
 */
export async function withRetry<T>(
    label: string,
    operation: () => Promise<T>,
    shouldRetry: (error: unknown) => boolean = isRetryable,
): Promise<T> {
    const {retries, baseDelayMs, maxDelayMs} = retryDefaults;
    for (let attempt = 0; ; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= retries || !shouldRetry(error)) {
                throw error;
            }
            const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
            const wait = Math.min(maxDelayMs, retryAfterMs(error) ?? backoff + Math.random() * baseDelayMs);
            console.log(`${label}: ${describeError(error)}; retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${retries})`);
            await delay(wait);
        }
    }
}

/**
 * One-line description of an error that never includes request URLs or headers,
 * so API keys cannot leak into CI logs.
 */
export function describeError(error: any): string {
    const status = statusOf(error);
    const apiMessage =
        error?.response?.data?.error?.message ??
        (typeof error?.response?.data?.message === 'string' ? error.response.data.message : undefined) ??
        error?.error?.error?.message;
    const message = apiMessage || error?.message || String(error);
    return status ? `HTTP ${status}: ${message}` : message;
}
