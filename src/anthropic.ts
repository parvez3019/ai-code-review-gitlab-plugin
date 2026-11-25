import Anthropic from '@anthropic-ai/sdk';
import {AICodeReviewClient, AIClientConfig, DEFAULT_TIMEOUT_MS, MAX_OUTPUT_TOKENS, ReviewRequest, ReviewResponse} from './ai-client';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';

/**
 * Models that accept server-side refusal fallbacks. Fallbacks are only enabled
 * against the real Anthropic API, since proxies set via ANTHROPIC_BASE_URL may
 * not understand the beta parameter.
 */
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

/** Calls the Anthropic Messages API through the official SDK. */
export class AnthropicClient implements AICodeReviewClient {
    private client: Anthropic;
    private model: string;
    private useFallbacks: boolean;

    constructor(config: AIClientConfig) {
        if (!config.apiKey) {
            throw new Error('API key is required for Anthropic client');
        }
        this.model = config.model || DEFAULT_ANTHROPIC_MODEL;
        this.useFallbacks = !config.apiUrl && FALLBACK_MODELS.has(this.model);
        this.client = new Anthropic({
            apiKey: config.apiKey,
            baseURL: config.apiUrl || undefined,
            timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            // Retries are handled by withRetry() so every provider behaves the same way.
            maxRetries: 0,
        });
    }

    async complete({system, user}: ReviewRequest): Promise<ReviewResponse> {
        const response = await this.client.beta.messages.create({
            model: this.model,
            max_tokens: MAX_OUTPUT_TOKENS,
            // The system prompt is the same for every file in a run: cache it.
            system: [{type: 'text', text: system, cache_control: {type: 'ephemeral'}}],
            messages: [{role: 'user', content: user}],
            ...(this.useFallbacks ? {betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const} : {}),
        });

        if (response.stop_reason === 'refusal') {
            throw new Error(`Anthropic declined to review this change (${response.stop_details?.category ?? 'no category'})`);
        }
        const text = response.content
            .map((block) => (block.type === 'text' ? block.text : ''))
            .join('\n')
            .trim();
        if (!text) {
            throw new Error(`Empty response from Anthropic (stop_reason: ${response.stop_reason})`);
        }
        return {
            text,
            usage: {
                inputTokens: (response.usage.input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
                outputTokens: response.usage.output_tokens ?? 0,
                cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
            },
        };
    }
}
