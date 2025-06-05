export interface AICodeReviewClient {
    reviewCodeChange(change: string): Promise<string>;
}

export interface AIClientConfig {
    apiKey: string;
    apiSecret?: string;  // Optional for Gemini, required for Bedrock
    apiUrl?: string;     // Optional, used by Gemini client
    model?: string;
    region?: string;
    systemPrompt?: string;
    codeReviewPrompt?: string;
} 