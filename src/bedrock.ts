import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { AICodeReviewClient, AIClientConfig } from "./ai-client";
import { systemPrompt, codeReviewPrompt } from "./utils";

export class BedrockClient implements AICodeReviewClient {
    private client: BedrockRuntimeClient;
    private model: string;

    constructor(config: AIClientConfig) {
        this.client = new BedrockRuntimeClient({
            region: process.env.AWS_REGION || config.region || "us-east-1",
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
            },
        });
        this.model = config.model || "anthropic.claude-3-sonnet-20240229-v1:0";
    }

    async reviewCodeChange(change: string): Promise<string> {
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
            const response = await this.client.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            return responseBody.content[0].text;
        } catch (error) {
            console.error("Error calling Bedrock:", error);
            throw new Error("Failed to get code review from Bedrock");
        }
    }
} 