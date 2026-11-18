import axios, {AxiosInstance} from 'axios';
import {AICodeReviewClient, AIClientConfig} from './ai-client';
import {getSystemPrompt, getCodeReviewPrompt} from './utils';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

/** Calls the Anthropic Messages API directly (no AWS account required). */
export class AnthropicClient implements AICodeReviewClient {
    private apiClient: AxiosInstance;
    private model: string;
    private config: AIClientConfig;

    constructor(config: AIClientConfig) {
        if (!config.apiKey) {
            throw new Error('API key is required for Anthropic client');
        }
        this.config = config;
        this.model = config.model || DEFAULT_ANTHROPIC_MODEL;
        this.apiClient = axios.create({
            baseURL: config.apiUrl || DEFAULT_ANTHROPIC_BASE_URL,
            headers: {
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
        });
    }

    async reviewCodeChange(change: string): Promise<string> {
        if (!change?.trim()) {
            throw new Error('Code change cannot be empty');
        }

        const [systemPrompt, codeReviewPrompt] = await Promise.all([
            this.config.systemPrompt || getSystemPrompt(),
            this.config.codeReviewPrompt || getCodeReviewPrompt(),
        ]);

        try {
            const response = await this.apiClient.post('/v1/messages', {
                model: this.model,
                max_tokens: 4096,
                system: `${systemPrompt}\n\n${codeReviewPrompt}`,
                messages: [{role: 'user', content: change}],
            });
            const text = (response.data?.content || [])
                .filter((block: {type: string}) => block.type === 'text')
                .map((block: {text: string}) => block.text)
                .join('\n')
                .trim();
            if (!text) {
                throw new Error('Invalid response format from Anthropic');
            }
            return text;
        } catch (error: any) {
            console.error('Error calling Anthropic:', error?.response?.data || error?.message || error);
            // Re-throw as-is so the caller can inspect error.response.status (e.g. 429 retry).
            throw error;
        }
    }
}
