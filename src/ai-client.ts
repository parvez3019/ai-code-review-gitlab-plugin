export interface ReviewRequest {
    /** Identical for every call in a run, so providers can cache it. */
    system: string;
    user: string;
}

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
}

export interface ReviewResponse {
    text: string;
    usage?: TokenUsage;
}

/**
 * Providers send one request and return the text. They throw the original
 * error (with its HTTP status) so the caller can decide whether to retry.
 */
export interface AICodeReviewClient {
    complete(request: ReviewRequest): Promise<ReviewResponse>;
}

export interface AIClientConfig {
    apiKey: string;
    apiSecret?: string; // AWS secret access key (Bedrock)
    apiUrl?: string;
    model?: string;
    region?: string;
    timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 120_000;
/** Enough room for a JSON list of comments plus any reasoning the model does first. */
export const MAX_OUTPUT_TOKENS = 16_000;
