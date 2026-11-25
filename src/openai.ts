import axios, {AxiosInstance} from 'axios';
import {AICodeReviewClient, AIClientConfig, DEFAULT_TIMEOUT_MS, ReviewRequest, ReviewResponse} from './ai-client';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Client for any OpenAI-compatible Chat Completions endpoint:
 * OpenAI, Ollama (http://localhost:11434/v1), vLLM, LM Studio, LiteLLM, OpenRouter, etc.
 */
export class OpenAICompatibleClient implements AICodeReviewClient {
    private apiClient: AxiosInstance;
    private model: string;

    constructor(config: AIClientConfig) {
        if (!config.model) {
            throw new Error('A model is required for the OpenAI-compatible client');
        }
        this.model = config.model;
        const headers: Record<string, string> = {'content-type': 'application/json'};
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }
        this.apiClient = axios.create({
            baseURL: (config.apiUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ''),
            headers,
            timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
    }

    async complete({system, user}: ReviewRequest): Promise<ReviewResponse> {
        const response = await this.apiClient.post('/chat/completions', {
            model: this.model,
            messages: [
                {role: 'system', content: system},
                {role: 'user', content: user},
            ],
        });
        const text = response.data?.choices?.[0]?.message?.content?.trim();
        if (!text) {
            throw new Error('Empty response from the OpenAI-compatible endpoint');
        }
        const usage = response.data?.usage;
        return {
            text,
            usage: usage ? {inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0} : undefined,
        };
    }
}
