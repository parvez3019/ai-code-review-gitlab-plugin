export const PROVIDERS = ['gemini', 'bedrock', 'anthropic', 'openai'] as const;
export type Provider = typeof PROVIDERS[number];

export interface CliOptions {
    gitlabApiUrl?: string;
    gitlabAccessToken?: string;
    projectId?: string;
    mergeRequestId?: string;
    aiProvider?: string;
    apiKey?: string;
    apiSecret?: string;
    apiUrl?: string;
    region?: string;
    customModel?: string;
    systemPromptPath?: string;
    codeReviewPromptPath?: string;
    s3Region?: string;
    s3AccessKey?: string;
    s3SecretKey?: string;
    attribution?: boolean;
    dryRun?: boolean;
}

export interface ResolvedConfig {
    gitlabApiUrl: string;
    gitlabAccessToken: string;
    projectId: string;
    mergeRequestId: string;
    provider: Provider;
    apiKey?: string;
    apiSecret?: string;
    apiUrl?: string;
    region: string;
    model?: string;
    systemPromptPath?: string;
    codeReviewPromptPath?: string;
    s3Region?: string;
    s3AccessKey?: string;
    s3SecretKey?: string;
    attribution: boolean;
    dryRun: boolean;
}

type Env = Record<string, string | undefined>;

const first = (...values: Array<string | undefined>): string | undefined =>
    values.find((v) => v !== undefined && v !== '');

const isTruthy = (value?: string): boolean =>
    value !== undefined && ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());

const isFalsy = (value?: string): boolean =>
    value !== undefined && ['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());

/**
 * Resolve CLI options, falling back to environment variables and GitLab CI
 * predefined variables, so the tool works with zero flags inside a merge
 * request pipeline. Explicit CLI flags always win.
 */
export function resolveConfig(opts: CliOptions, env: Env = process.env): ResolvedConfig {
    const providerRaw = (first(opts.aiProvider, env.AI_PROVIDER) || 'gemini').toLowerCase();
    if (!(PROVIDERS as readonly string[]).includes(providerRaw)) {
        throw new Error(`Unsupported AI provider: ${providerRaw}. Supported: ${PROVIDERS.join(', ')}`);
    }
    const provider = providerRaw as Provider;

    const gitlabAccessToken = first(opts.gitlabAccessToken, env.CODE_REVIEW_GITLAB_TOKEN, env.GITLAB_TOKEN);
    const projectId = first(opts.projectId, env.CI_MERGE_REQUEST_PROJECT_ID, env.CI_PROJECT_ID);
    const mergeRequestId = first(opts.mergeRequestId, env.CI_MERGE_REQUEST_IID);

    const missing: string[] = [];
    if (!gitlabAccessToken) missing.push('GitLab access token (--gitlab-access-token or CODE_REVIEW_GITLAB_TOKEN)');
    if (!projectId) missing.push('project ID (--project-id or CI_MERGE_REQUEST_PROJECT_ID)');
    if (!mergeRequestId) missing.push('merge request IID (--merge-request-id or CI_MERGE_REQUEST_IID)');

    let apiKey: string | undefined;
    let apiSecret: string | undefined;
    let model: string | undefined = first(opts.customModel, env.AI_MODEL);
    let apiUrl: string | undefined = first(opts.apiUrl, env.AI_API_URL);

    switch (provider) {
        case 'gemini':
            apiKey = first(opts.apiKey, env.GEMINI_API_KEY);
            model = model || first(env.GEMINI_MODEL);
            apiUrl = apiUrl || first(env.GEMINI_API_URL);
            if (!apiKey) missing.push('Gemini API key (--api-key or GEMINI_API_KEY)');
            break;
        case 'bedrock':
            apiKey = first(opts.apiKey, env.AWS_ACCESS_KEY_ID);
            apiSecret = first(opts.apiSecret, env.AWS_SECRET_ACCESS_KEY);
            model = model || first(env.AWS_BEDROCK_MODEL);
            if (!apiKey) missing.push('AWS access key ID (--api-key or AWS_ACCESS_KEY_ID)');
            if (!apiSecret) missing.push('AWS secret access key (--api-secret or AWS_SECRET_ACCESS_KEY)');
            break;
        case 'anthropic':
            apiKey = first(opts.apiKey, env.ANTHROPIC_API_KEY);
            model = model || first(env.ANTHROPIC_MODEL);
            apiUrl = apiUrl || first(env.ANTHROPIC_BASE_URL);
            if (!apiKey) missing.push('Anthropic API key (--api-key or ANTHROPIC_API_KEY)');
            break;
        case 'openai':
            // API key is optional: local servers such as Ollama do not need one.
            apiKey = first(opts.apiKey, env.OPENAI_API_KEY);
            model = model || first(env.OPENAI_MODEL);
            apiUrl = apiUrl || first(env.OPENAI_BASE_URL);
            if (!model) missing.push('model (--custom-model, AI_MODEL or OPENAI_MODEL)');
            break;
    }

    if (missing.length) {
        throw new Error(`Missing required configuration:\n  - ${missing.join('\n  - ')}`);
    }

    return {
        gitlabApiUrl: first(opts.gitlabApiUrl, env.CI_API_V4_URL) || 'https://gitlab.com/api/v4',
        gitlabAccessToken: gitlabAccessToken!,
        projectId: projectId!,
        mergeRequestId: mergeRequestId!,
        provider,
        apiKey,
        apiSecret,
        apiUrl,
        region: first(opts.region, env.AWS_REGION) || 'us-east-1',
        model,
        systemPromptPath: first(opts.systemPromptPath, env.SYSTEM_PROMPT_PATH),
        codeReviewPromptPath: first(opts.codeReviewPromptPath, env.CODE_REVIEW_PROMPT_PATH),
        s3Region: first(opts.s3Region, env.S3_REGION),
        s3AccessKey: first(opts.s3AccessKey, env.S3_ACCESS_KEY),
        s3SecretKey: first(opts.s3SecretKey, env.S3_SECRET_KEY),
        attribution: opts.attribution !== false && !isFalsy(env.AI_REVIEW_ATTRIBUTION),
        dryRun: opts.dryRun === true || isTruthy(env.AI_REVIEW_DRY_RUN),
    };
}
