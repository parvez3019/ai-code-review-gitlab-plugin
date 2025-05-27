import {Command} from 'commander';
import {GitLab} from './gitlab';
import {Gemini} from './gemini';
import {BedrockClient} from './bedrock';
import {AICodeReviewClient, AIClientConfig} from './ai-client';
import {delay, getDiffBlocks, getLineObj} from "./utils";

const program = new Command();

program
    .option('-g, --gitlab-api-url <string>', 'GitLab API URL', 'https://gitlab.com/api/v4')
    .option('-t, --gitlab-access-token <string>', 'GitLab Access Token')
    .option('-p, --project-id <number>', 'GitLab Project ID')
    .option('-m, --merge-request-id <string>', 'GitLab Merge Request ID')
    .option('-a, --ai-provider <string>', 'AI Provider (gemini or bedrock)', 'gemini')
    .option('-k, --api-key <string>', 'API Key (Gemini API Key or AWS Access Key ID)')
    .option('-s, --api-secret <string>', 'API Secret (AWS Secret Access Key for Bedrock)')
    .option('-r, --region <string>', 'AWS Region for Bedrock', 'us-east-1')
    .option('-c, --custom-model <string>', 'Custom Model ID')
    .parse(process.argv);

const GEMINI = 'gemini';
const BEDROCK = 'bedrock';

async function createAIClient(): Promise<AICodeReviewClient> {
    const {
        aiProvider,
        apiKey,
        apiSecret,
        region,
        customModel,
    } = program.opts();

    if (!apiKey) {
        throw new Error('API Key is required');
    }

    const config: AIClientConfig = {
        apiKey: apiKey,
        apiSecret: apiSecret,
        model: customModel,
        region: region,
    };

    switch (aiProvider.toLowerCase()) {
        case GEMINI:
            config.apiUrl = 'https://generativelanguage.googleapis.com';
            return new Gemini(config);
        case BEDROCK:
            if (!apiSecret) {
                throw new Error('AWS Secret Access Key is required for Bedrock');
            }
            return new BedrockClient(config);
        default:
            throw new Error(`Unsupported AI provider: ${aiProvider}`);
    }
}

async function run() {
    const {
        gitlabApiUrl,
        gitlabAccessToken,
        projectId,
        mergeRequestId,
    } = program.opts();

    const gitlab = new GitLab({
        gitlabApiUrl,
        gitlabAccessToken,
        projectId,
        mergeRequestId
    });

    let aiClient: AICodeReviewClient;
    try {
        aiClient = await createAIClient();
    } catch (error) {
        console.error('Failed to create AI client:', error);
        process.exit(1);
    }

    await gitlab.init().catch(() => {
        console.log('gitlab init error');
    });

    const changes = await gitlab.getMergeRequestChanges().catch(() => {
        console.log('get merge request changes error');
    });

    for (const change of changes) {
        if (change.renamed_file || change.deleted_file || !change?.diff?.startsWith('@@')) {
            continue;
        }
        const diffBlocks = getDiffBlocks(change?.diff);
        while (!!diffBlocks.length) {
            const item = diffBlocks.shift()!;
            const lineRegex = /@@\s-(\d+)(?:,(\d+))?\s\+(\d+)(?:,(\d+))?\s@@/;
            const matches = lineRegex.exec(item);
            if (matches) {
                const lineObj = getLineObj(matches, item);
                if ((lineObj?.new_line && lineObj?.new_line > 0) || (lineObj.old_line && lineObj.old_line > 0)) {
                    try {
                        const suggestion = await aiClient.reviewCodeChange(item);
                        await gitlab.addReviewComment(lineObj, change, suggestion);
                    } catch (e: any) {
                        if (e?.response?.status === 429) {
                            console.log('Too Many Requests, try again');
                            await delay(60 * 1000);
                            diffBlocks.push(item);
                        }
                    }
                }
            }
        }
    }
    console.log('done');
}

module.exports = run;

