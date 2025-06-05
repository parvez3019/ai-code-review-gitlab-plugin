import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { AICodeReviewClient, AIClientConfig } from "./ai-client";
import { getSystemPrompt, getCodeReviewPrompt } from "./utils";

// Types for Bedrock response
interface BedrockResponse {
    content: Array<{
        text: string;
    }>;
}

interface BedrockError extends Error {
    $metadata?: {
        httpStatusCode?: number;
        requestId?: string;
    };
}

export class BedrockClient implements AICodeReviewClient {
    private client: BedrockRuntimeClient;
    private model: string;
    private readonly maxRetries = 3;
    private readonly retryDelay = 1000; // 1 second
    private config: AIClientConfig;

    constructor(config: AIClientConfig) {
        if (!config.apiKey || !config.apiSecret) {
            throw new Error("AWS credentials (apiKey and apiSecret) are required for Bedrock client");
        }

        this.config = config;
        this.client = new BedrockRuntimeClient({
            region: process.env.AWS_REGION || config.region || "us-east-1",
            credentials: {
                accessKeyId: config.apiKey,
                secretAccessKey: config.apiSecret,
            },
        });

        // Use environment variable, config, or default model
        this.model = process.env.AWS_BEDROCK_MODEL || config.model || "anthropic.claude-3-5-sonnet-20241022-v2:0";
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async retryWithBackoff<T>(operation: () => Promise<T>, retryCount = 0): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            const bedrockError = error as BedrockError;
            
            // Check if error is retryable
            const isRetryable = 
                bedrockError.$metadata?.httpStatusCode === 429 || // Rate limit
                bedrockError.$metadata?.httpStatusCode === 500 || // Server error
                bedrockError.$metadata?.httpStatusCode === 503;   // Service unavailable

            if (isRetryable && retryCount < this.maxRetries) {
                const delay = this.retryDelay * Math.pow(2, retryCount);
                console.log(`Retrying after ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
                await this.sleep(delay);
                return this.retryWithBackoff(operation, retryCount + 1);
            }
            throw error;
        }
    }

    async reviewCodeChange(change: string): Promise<string> {
        if (!change?.trim()) {
            throw new Error("Code change cannot be empty");
        }

        const [systemPrompt, codeReviewPrompt] = await Promise.all([
            this.config.systemPrompt || getSystemPrompt(),
            this.config.codeReviewPrompt || getCodeReviewPrompt()
        ]);

        const prompt = `${systemPrompt}\n\n${codeReviewPrompt}\n\n${change}`;

        const command = new InvokeModelCommand({
            modelId: this.model,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 4096,
                temperature: 0.7,
                top_p: 0.95,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            }),
        });

        try {
            const response = await this.retryWithBackoff(async () => {
                const result = await this.client.send(command);
                const responseBody = JSON.parse(new TextDecoder().decode(result.body)) as BedrockResponse;
                
                if (!responseBody?.content?.[0]?.text) {
                    throw new Error("Invalid response format from Bedrock");
                }
                
                return responseBody.content[0].text;
            });

            return response;
        } catch (error) {
            const bedrockError = error as BedrockError;
            console.error("Error calling Bedrock:", {
                error: bedrockError.message,
                statusCode: bedrockError.$metadata?.httpStatusCode,
                requestId: bedrockError.$metadata?.requestId
            });
            throw new Error(`Failed to get code review from Bedrock: ${bedrockError.message}`);
        }
    }
} 