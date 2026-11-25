import axios, {AxiosInstance} from 'axios';
import {AICodeReviewClient, AIClientConfig, DEFAULT_TIMEOUT_MS, MAX_OUTPUT_TOKENS, ReviewRequest, ReviewResponse} from './ai-client';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const DEFAULT_GEMINI_API_URL = 'https://generativelanguage.googleapis.com';

// Code under review often contains security-related content; do not let it be blocked.
const SAFETY_SETTINGS = [
    'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    'HARM_CATEGORY_HATE_SPEECH',
    'HARM_CATEGORY_HARASSMENT',
    'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({category, threshold: 'BLOCK_NONE'}));

export class Gemini implements AICodeReviewClient {
    private apiClient: AxiosInstance;
    private model: string;

    constructor(config: AIClientConfig) {
        if (!config.apiKey) {
            throw new Error('API key is required for Gemini client');
        }
        this.model = config.model || DEFAULT_GEMINI_MODEL;
        this.apiClient = axios.create({
            baseURL: config.apiUrl || DEFAULT_GEMINI_API_URL,
            timeout: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            // The key goes in a header, never in the URL, so it cannot end up in logs.
            headers: {'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey},
        });
    }

    async complete({system, user}: ReviewRequest): Promise<ReviewResponse> {
        const response = await this.apiClient.post(`/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, {
            contents: [{role: 'user', parts: [{text: user}]}],
            systemInstruction: {parts: [{text: system}]},
            safetySettings: SAFETY_SETTINGS,
            generationConfig: {
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                responseMimeType: 'application/json',
            },
        });

        const candidate = response.data?.candidates?.[0];
        const text = (candidate?.content?.parts || [])
            .map((part: {text?: string}) => part.text || '')
            .join('')
            .trim();
        if (!text) {
            throw new Error(`Empty response from Gemini (finishReason: ${candidate?.finishReason ?? 'unknown'})`);
        }
        const usage = response.data?.usageMetadata;
        return {
            text,
            usage: usage
                ? {
                    inputTokens: usage.promptTokenCount ?? 0,
                    outputTokens: usage.candidatesTokenCount ?? 0,
                    cacheReadTokens: usage.cachedContentTokenCount ?? 0,
                }
                : undefined,
        };
    }
}
