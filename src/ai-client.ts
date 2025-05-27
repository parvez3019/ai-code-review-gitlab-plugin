export interface AICodeReviewClient {
    reviewCodeChange(change: string): Promise<string>;
}

export interface AIClientConfig {
    apiUrl?: string;
    accessToken?: string;
    model?: string;
    region?: string;
} 