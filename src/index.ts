import {Command} from 'commander';
import {GitLab} from './gitlab';
import {Gemini} from './gemini';
import {BedrockClient} from './bedrock';
import {AnthropicClient} from './anthropic';
import {OpenAICompatibleClient} from './openai';
import {AICodeReviewClient, AIClientConfig} from './ai-client';
import {resolveConfig, ResolvedConfig, PROVIDERS} from './config';
import {delay, getDiffBlocks, getLineObj, getSystemPrompt, getCodeReviewPrompt} from "./utils";

const program = new Command();

// Note: no commander defaults here; defaults and env-var fallbacks live in resolveConfig()
// so that GitLab CI predefined variables are picked up automatically.
program
    .option('-g, --gitlab-api-url <string>', 'GitLab API URL (default: $CI_API_V4_URL or https://gitlab.com/api/v4)')
    .option('-t, --gitlab-access-token <string>', 'GitLab Access Token (default: $CODE_REVIEW_GITLAB_TOKEN or $GITLAB_TOKEN)')
    .option('-p, --project-id <number>', 'GitLab Project ID (default: $CI_MERGE_REQUEST_PROJECT_ID)')
    .option('-m, --merge-request-id <string>', 'GitLab Merge Request IID (default: $CI_MERGE_REQUEST_IID)')
    .option('-a, --ai-provider <string>', `AI Provider: ${PROVIDERS.join(', ')} (default: $AI_PROVIDER or gemini)`)
    .option('-k, --api-key <string>', 'API Key (Gemini/Anthropic/OpenAI key, or AWS Access Key ID for Bedrock)')
    .option('-s, --api-secret <string>', 'API Secret (AWS Secret Access Key for Bedrock)')
    .option('-u, --api-url <string>', 'Base URL for the AI API (e.g. http://localhost:11434/v1 for Ollama)')
    .option('-r, --region <string>', 'AWS Region for Bedrock (default: $AWS_REGION or us-east-1)')
    .option('-c, --custom-model <string>', 'Custom Model ID (default: $AI_MODEL or provider default)')
    .option('-sp, --system-prompt-path <string>', 'Path to custom system prompt file (local file or s3://bucket/key)')
    .option('-crp, --code-review-prompt-path <string>', 'Path to custom code review prompt file (local file or s3://bucket/key)')
    .option('--s3-region <string>', 'AWS Region for S3 (if using S3 paths)')
    .option('--s3-access-key <string>', 'AWS Access Key ID for S3 (if using S3 paths)')
    .option('--s3-secret-key <string>', 'AWS Secret Access Key for S3 (if using S3 paths)')
    .option('--no-attribution', 'Do not add the "Reviewed by" footer to the summary comment')
    .option('--max-hunks <number>', 'Review at most this many diff hunks and post a note about the rest (default: $AI_REVIEW_MAX_HUNKS, unlimited)');

const ATTRIBUTION_FOOTER =
    '\n\n---\n<sub>🤖 Reviewed by [ai-code-review-gitlab-plugin](https://github.com/parvez3019/ai-code-review-gitlab-plugin)</sub>';

async function createAIClient(cfg: ResolvedConfig): Promise<AICodeReviewClient> {
    // Expose S3 settings to the prompt loader
    if (cfg.s3Region) process.env.S3_REGION = cfg.s3Region;
    if (cfg.s3AccessKey) process.env.S3_ACCESS_KEY = cfg.s3AccessKey;
    if (cfg.s3SecretKey) process.env.S3_SECRET_KEY = cfg.s3SecretKey;

    const config: AIClientConfig = {
        apiKey: cfg.apiKey || '',
        apiSecret: cfg.apiSecret,
        apiUrl: cfg.apiUrl,
        model: cfg.model,
        region: cfg.region,
    };

    if (cfg.systemPromptPath || cfg.codeReviewPromptPath) {
        const [systemPrompt, codeReviewPrompt] = await Promise.all([
            cfg.systemPromptPath ? getSystemPrompt(cfg.systemPromptPath) : undefined,
            cfg.codeReviewPromptPath ? getCodeReviewPrompt(cfg.codeReviewPromptPath) : undefined,
        ]);
        if (systemPrompt) config.systemPrompt = systemPrompt;
        if (codeReviewPrompt) config.codeReviewPrompt = codeReviewPrompt;
    }

    switch (cfg.provider) {
        case 'gemini':
            return new Gemini(config);
        case 'bedrock':
            return new BedrockClient(config);
        case 'anthropic':
            return new AnthropicClient(config);
        case 'openai':
            return new OpenAICompatibleClient(config);
    }
}

const NO_REVIEW_CONTENT_PLACEHOLDER = '204';

async function run(argv: string[] = process.argv) {
    program.parse(argv);

    let cfg: ResolvedConfig;
    let aiClient: AICodeReviewClient;
    try {
        cfg = resolveConfig(program.opts());
        aiClient = await createAIClient(cfg);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }

    console.log(`Reviewing MR !${cfg.mergeRequestId} in project ${cfg.projectId} with provider "${cfg.provider}"`);

    const gitlab = new GitLab({
        gitlabApiUrl: cfg.gitlabApiUrl,
        gitlabAccessToken: cfg.gitlabAccessToken,
        projectId: cfg.projectId,
        mergeRequestId: cfg.mergeRequestId,
    });

    try {
        await gitlab.init();
    } catch (error: any) {
        console.error('Failed to load merge request from GitLab:', error?.response?.status, error?.message);
        process.exit(1);
    }

    let changes: Array<Record<string, any>>;
    try {
        changes = (await gitlab.getMergeRequestChanges()) || [];
    } catch (error: any) {
        console.error('Failed to get merge request changes:', error?.response?.status, error?.message);
        process.exit(1);
    }

    const noFeedbackLogs: Array<{file: string, line: any, code: string}> = [];
    let reviewedHunks = 0;
    let skippedHunks = 0;

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
                    if (cfg.maxHunks !== undefined && reviewedHunks >= cfg.maxHunks) {
                        skippedHunks++;
                        continue;
                    }
                    reviewedHunks++;
                    try {
                        const suggestion = await aiClient.reviewCodeChange(item);
                        if (suggestion.trim() === NO_REVIEW_CONTENT_PLACEHOLDER) {
                            console.log('No feedback for this change', lineObj);
                            // Extract code lines from the diff block
                            const codeLines = item.split('\n')
                                .filter(line => line.startsWith('+') || line.startsWith('-'))
                                .map(line => line.substring(1)) // Remove the + or - prefix
                                .join('\n');

                            noFeedbackLogs.push({
                                file: change.new_path,
                                line: lineObj,
                                code: codeLines
                            });
                            continue;
                        }
                        await gitlab.addReviewComment(lineObj, change, suggestion);
                    } catch (e: any) {
                        if (e?.response?.status === 429) {
                            console.log('Too Many Requests, try again');
                            reviewedHunks--; // the retry is counted again when it is re-queued
                            await delay(60 * 1000);
                            diffBlocks.push(item);
                        } else {
                            console.error(`Failed to review ${change.new_path}:`, e?.message || e);
                        }
                    }
                }
            }
        }
    }

    // Add summary comment for no feedback logs
    if (noFeedbackLogs.length > 0) {
        const summaryMessage = `### No Feedback Summary\n\nThe following changes were reviewed and required no further feedback, great work 💪 :\n\n${noFeedbackLogs.map(log =>
            `- File: \`${log.file}\`, Line: ${log.line.new_line ?? log.line.old_line}`
        ).join('\n')}${cfg.attribution ? ATTRIBUTION_FOOTER : ''}`;

        await gitlab.addComment(summaryMessage);
    }

    if (skippedHunks > 0) {
        console.log(`Review limit reached: ${skippedHunks} hunk(s) skipped (--max-hunks ${cfg.maxHunks})`);
        await gitlab.addComment(
            `### Review Limit Reached

Only the first ${cfg.maxHunks} diff hunks were reviewed; ${skippedHunks} more ${skippedHunks === 1 ? 'hunk was' : 'hunks were'} skipped because of the configured \`--max-hunks\` limit.${cfg.attribution ? ATTRIBUTION_FOOTER : ''}`
        );
    }

    console.log('done');
}

module.exports = run;
