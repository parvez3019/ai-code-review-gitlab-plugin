import {BedrockRuntimeClient, InvokeModelCommand} from '@aws-sdk/client-bedrock-runtime';
import {AICodeReviewClient, AIClientConfig, DEFAULT_TIMEOUT_MS, MAX_OUTPUT_TOKENS, ReviewRequest, ReviewResponse} from './ai-client';

// Newer Claude models on Bedrock must be invoked through a cross-region inference profile.
export const DEFAULT_BEDROCK_MODEL = 'us.anthropic.claude-sonnet-5';

interface BedrockResponse {
    content?: Array<{type?: string; text?: string}>;
    stop_reason?: string;
    usage?: {input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number};
}

export class BedrockClient implements AICodeReviewClient {
    private client: BedrockRuntimeClient;
    private model: string;

    constructor(config: AIClientConfig) {
        if (!config.apiKey || !config.apiSecret) {
            throw new Error('AWS credentials (apiKey and apiSecret) are required for Bedrock client');
        }
        this.client = new BedrockRuntimeClient({
            region: config.region || 'us-east-1',
            credentials: {accessKeyId: config.apiKey, secretAccessKey: config.apiSecret},
            // Retries are handled by withRetry() so every provider behaves the same way.
            maxAttempts: 1,
            requestHandler: {requestTimeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS} as any,
        });
        this.model = config.model || DEFAULT_BEDROCK_MODEL;
    }

    async complete({system, user}: ReviewRequest): Promise<ReviewResponse> {
        const command = new InvokeModelCommand({
            modelId: this.model,
            contentType: 'application/json',
            accept: 'application/json',
            // No temperature/top_p: current Claude models reject sampling parameters.
            body: JSON.stringify({
                anthropic_version: 'bedrock-2023-05-31',
                max_tokens: MAX_OUTPUT_TOKENS,
                system,
                messages: [{role: 'user', content: user}],
            }),
        });

        const result = await this.client.send(command);
        const body = JSON.parse(new TextDecoder().decode(result.body)) as BedrockResponse;
        if (body.stop_reason === 'refusal') {
            throw new Error('Bedrock declined to review this change (stop_reason: refusal)');
        }
        const text = (body.content || [])
            .filter((block) => !block.type || block.type === 'text')
            .map((block) => block.text || '')
            .join('\n')
            .trim();
        if (!text) {
            throw new Error(`Empty response from Bedrock (stop_reason: ${body.stop_reason ?? 'unknown'})`);
        }
        return {
            text,
            usage: body.usage
                ? {
                    inputTokens: body.usage.input_tokens ?? 0,
                    outputTokens: body.usage.output_tokens ?? 0,
                    cacheReadTokens: body.usage.cache_read_input_tokens ?? 0,
                }
                : undefined,
        };
    }
}
