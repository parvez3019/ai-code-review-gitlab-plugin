import axios, {AxiosInstance} from 'axios';
import {AICodeReviewClient, AIClientConfig} from './ai-client';
import {getSystemPrompt, getCodeReviewPrompt} from './utils';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Client for any OpenAI-compatible Chat Completions endpoint:
 * OpenAI, Ollama (http://localhost:11434/v1), vLLM, LM Studio, LiteLLM, OpenRouter, etc.
 */
export class OpenAICompatibleClient implements AICodeReviewClient {
    private apiClient: AxiosInstance;
    private model: string;
    private config: AIClientConfig;

    constructor(config: AIClientConfig) {
        if (!config.model) {
            throw new Error('A model is required for the OpenAI-compatible client');
        }
        this.config = config;
        this.model = config.model;
        const headers: Record<string, string> = {'content-type': 'application/json'};
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }
        this.apiClient = axios.create({
            baseURL: (config.apiUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ''),
            headers,
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
            const response = await this.apiClient.post('/chat/completions', {
                model: this.model,
                messages: [
                    {role: 'system', content: `${systemPrompt}\n\n${codeReviewPrompt}`},
                    {role: 'user', content: change},
                ],
            });
            const text = response.data?.choices?.[0]?.message?.content?.trim();
            if (!text) {
                throw new Error('Invalid response format from OpenAI-compatible endpoint');
            }
            return text;
        } catch (error: any) {
            console.error('Error calling OpenAI-compatible endpoint:', error?.response?.data || error?.message || error);
            throw error;
        }
    }
}
