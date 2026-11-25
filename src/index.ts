import {Command} from 'commander';
import {GitLab} from './gitlab';
import {Gemini} from './gemini';
import {BedrockClient} from './bedrock';
import {AnthropicClient} from './anthropic';
import {OpenAICompatibleClient} from './openai';
import {AICodeReviewClient, AIClientConfig} from './ai-client';
import {loadConfigFile, resolveConfig, ResolvedConfig, PROVIDERS} from './config';
import {buildSystemPrompt} from './prompts';
import {runReview} from './review';
import {describeError} from './retry';

function buildProgram(): Command {
    // No commander defaults: defaults and env-var fallbacks live in resolveConfig()
    // so that GitLab CI predefined variables are picked up automatically.
    return new Command()
        .name('ai-code-review-gitlab-plugin')
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
        .option('--config <path>', 'Repository config file (default: .ai-review.yml if present)')
        .option('--include <globs>', 'Only review files matching these comma-separated globs')
        .option('--exclude <globs>', 'Skip files matching these comma-separated globs (added to the defaults)')
        .option('--no-default-excludes', 'Also review lockfiles, vendored and generated files')
        .option('--min-severity <level>', 'Lowest severity to post: minor, major or critical (default: minor)')
        .option('--fail-on <level>', 'Exit with code 1 if a finding is at or above this severity (default: none)')
        .option('--max-files <n>', 'Review at most this many files, 0 for no limit (default: 50)')
        .option('--max-file-diff-lines <n>', 'Skip files with more changed lines than this (default: 1500)')
        .option('--file-context-chars <n>', 'Send the full file as context when it is at most this many characters, 0 to disable (default: 30000)')
        .option('--concurrency <n>', 'Files reviewed in parallel (default: 2)')
        .option('--timeout <seconds>', 'Timeout for each AI request (default: 120)')
        .option('--dry-run', 'Print the comments instead of posting them')
        .option('--no-incremental', 'Review every file on every run instead of only files changed since the last review')
        .option('--no-attribution', 'Do not add the "Reviewed by" footer to the summary comment');
}

function createAIClient(cfg: ResolvedConfig): AICodeReviewClient {
    const config: AIClientConfig = {
        apiKey: cfg.apiKey || '',
        apiSecret: cfg.apiSecret,
        apiUrl: cfg.apiUrl,
        model: cfg.model,
        region: cfg.region,
        timeoutMs: cfg.timeoutMs,
    };
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

/** Run the CLI and return the process exit code. */
async function run(argv: string[] = process.argv): Promise<number> {
    const program = buildProgram();
    program.parse(argv);
    const opts = program.opts();

    let cfg: ResolvedConfig;
    let ai: AICodeReviewClient;
    let systemPrompt: string;
    try {
        cfg = resolveConfig(opts, process.env, loadConfigFile(opts.config));
        ai = createAIClient(cfg);
        systemPrompt = await buildSystemPrompt({
            systemPromptPath: cfg.systemPromptPath,
            codeReviewPromptPath: cfg.codeReviewPromptPath,
            s3: {region: cfg.s3Region, accessKeyId: cfg.s3AccessKey, secretAccessKey: cfg.s3SecretKey},
        });
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        return 1;
    }

    console.log(`Reviewing MR !${cfg.mergeRequestId} in project ${cfg.projectId} with provider "${cfg.provider}"` +
        (cfg.model ? ` (model ${cfg.model})` : '') + (cfg.dryRun ? ' [dry run]' : ''));

    const gitlab = new GitLab({
        gitlabApiUrl: cfg.gitlabApiUrl,
        gitlabAccessToken: cfg.gitlabAccessToken,
        projectId: cfg.projectId,
        mergeRequestId: cfg.mergeRequestId,
    });

    try {
        const result = await runReview({...cfg, systemPrompt}, gitlab, ai);
        return result.exitCode;
    } catch (error) {
        console.error(`Review failed: ${describeError(error)}`);
        return 1;
    }
}

module.exports = run;
