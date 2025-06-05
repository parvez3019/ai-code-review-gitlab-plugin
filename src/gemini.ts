import axios, {AxiosInstance} from 'axios';
import {
    geminiCompletionsConfig,
    getSystemPrompt,
    getCodeReviewPrompt,
} from "./utils";
import { AICodeReviewClient, AIClientConfig } from "./ai-client";

const SAFETY_SETTINGS = [
    {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_NONE',
    },
    {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_NONE',
    },
]

export class Gemini implements AICodeReviewClient {
    private apiClient: AxiosInstance;
    private apiKey: string;
    private apiUrl: string;
    private model: string;
    private config: AIClientConfig;

    constructor(config: AIClientConfig) {
        if (!config.apiKey) {
            throw new Error("API key is required for Gemini client");
        }

        this.apiKey = config.apiKey;
        this.apiUrl = config.apiUrl || process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com";
        this.model = config.model || process.env.GEMINI_MODEL || geminiCompletionsConfig.model;
        this.config = config;

        this.apiClient = axios.create({
            baseURL: this.apiUrl,
        });
    }

    async reviewCodeChange(change: string): Promise<string> {
        if (!change?.trim()) {
            throw new Error("Code change cannot be empty");
        }

        const url = `/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36 Edg/91.0.864.41',
        }

        const [systemPrompt, codeReviewPrompt] = await Promise.all([
            this.config.systemPrompt || getSystemPrompt(),
            this.config.codeReviewPrompt || getCodeReviewPrompt()
        ]);

        const body = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: change
                        }
                    ]
                }
            ],
            systemInstruction: {
                parts: [
                    {
                        text: systemPrompt
                    },
                    {
                        text: codeReviewPrompt
                    }
                ]
            },
            safetySettings: SAFETY_SETTINGS,
        };

        try {
            const response = await this.apiClient.post(url, body, {
                headers: headers,
            });

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`Request failed with status ${response.status}`);
            }

            const data = response.data;
            if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                throw new Error("Invalid response format from Gemini");
            }

            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error("Error calling Gemini:", error);
            throw new Error(`Failed to get code review from Gemini: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}