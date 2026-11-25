import * as fs from 'fs';
import * as path from 'path';
import {parse as parseYaml} from 'yaml';
import {Severity, SEVERITIES} from './findings';

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
    config?: string;
    include?: string;
    exclude?: string;
    defaultExcludes?: boolean;
    minSeverity?: string;
    failOn?: string;
    maxFiles?: string;
    maxFileDiffLines?: string;
    fileContextChars?: string;
    concurrency?: string;
    timeout?: string;
    dryRun?: boolean;
    incremental?: boolean;
}

/** Settings that can also come from the repository's .ai-review.yml. */
export interface FileConfig {
    include?: string[] | string;
    exclude?: string[] | string;
    default_excludes?: boolean;
    min_severity?: string;
    fail_on?: string;
    max_files?: number;
    max_file_diff_lines?: number;
    file_context_chars?: number;
    concurrency?: number;
    incremental?: boolean;
    system_prompt_path?: string;
    code_review_prompt_path?: string;
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
    include: string[];
    exclude: string[];
    defaultExcludes: boolean;
    minSeverity: Severity;
    failOn?: Severity;
    maxFiles: number;
    maxFileDiffLines: number;
    fileContextChars: number;
    concurrency: number;
    timeoutMs: number;
    dryRun: boolean;
    incremental: boolean;
}

type Env = Record<string, string | undefined>;

const first = <T>(...values: Array<T | undefined>): T | undefined =>
    values.find((v) => v !== undefined && v !== '' && v !== null);

const FALSY = ['false', '0', 'no', 'off'];
const TRUTHY = ['true', '1', 'yes', 'on'];

/** Parse a boolean env var; undefined if unset or unrecognised. */
function envBool(value?: string): boolean | undefined {
    if (value === undefined) return undefined;
    const v = value.trim().toLowerCase();
    if (FALSY.includes(v)) return false;
    if (TRUTHY.includes(v)) return true;
    return undefined;
}

function list(value?: string[] | string): string[] | undefined {
    if (value === undefined || value === null) return undefined;
    const items = Array.isArray(value) ? value : String(value).split(/[,\n]/);
    const cleaned = items.map((s) => String(s).trim()).filter(Boolean);
    return cleaned.length ? cleaned : undefined;
}

/** Commander's --no-x flags default to true, so only an explicit false counts as set. */
const negatable = (value?: boolean): boolean | undefined => (value === false ? false : undefined);

/**
 * Load the repository config file. An explicitly requested file must exist; the
 * default .ai-review.yml is optional.
 */
export function loadConfigFile(explicitPath: string | undefined, env: Env = process.env): FileConfig {
    const baseDir = env.CI_PROJECT_DIR || process.cwd();
    const candidates = explicitPath
        ? [path.resolve(baseDir, explicitPath)]
        : ['.ai-review.yml', '.ai-review.yaml'].map((f) => path.join(baseDir, f));
    for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        const data = parseYaml(fs.readFileSync(file, 'utf-8'));
        if (data !== null && data !== undefined && (typeof data !== 'object' || Array.isArray(data))) {
            throw new Error(`${file} must contain a YAML mapping`);
        }
        console.log(`Using config file ${file}`);
        return (data || {}) as FileConfig;
    }
    if (explicitPath) {
        throw new Error(`Config file not found: ${candidates[0]}`);
    }
    return {};
}

/**
 * Resolve settings. Precedence: CLI flag → environment variable → config file → default.
 * GitLab CI predefined variables are picked up automatically, so the tool works with
 * zero flags inside a merge request pipeline.
 */
export function resolveConfig(opts: CliOptions, env: Env = process.env, file: FileConfig = {}): ResolvedConfig {
    const missing: string[] = [];
    const invalid: string[] = [];

    const providerRaw = (first(opts.aiProvider, env.AI_PROVIDER) || 'gemini').toLowerCase();
    if (!(PROVIDERS as readonly string[]).includes(providerRaw)) {
        throw new Error(`Unsupported AI provider: ${providerRaw}. Supported: ${PROVIDERS.join(', ')}`);
    }
    const provider = providerRaw as Provider;

    const gitlabAccessToken = first(opts.gitlabAccessToken, env.CODE_REVIEW_GITLAB_TOKEN, env.GITLAB_TOKEN);
    const projectId = first(opts.projectId, env.CI_MERGE_REQUEST_PROJECT_ID, env.CI_PROJECT_ID);
    const mergeRequestId = first(opts.mergeRequestId, env.CI_MERGE_REQUEST_IID);

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

    const severity = (name: string, value: string | undefined, fallback?: Severity): Severity | undefined => {
        if (value === undefined || value === '') return fallback;
        const v = value.trim().toLowerCase();
        if (v === 'none' || v === 'off') return undefined;
        if ((SEVERITIES as readonly string[]).includes(v)) return v as Severity;
        invalid.push(`${name} must be one of ${SEVERITIES.join(', ')}${name === 'fail-on' ? ', none' : ''} (got "${value}")`);
        return fallback;
    };

    const int = (name: string, value: string | number | undefined, fallback: number, min: number): number => {
        if (value === undefined || value === '') return fallback;
        const n = Number(value);
        if (!Number.isInteger(n) || n < min) {
            invalid.push(`${name} must be an integer >= ${min} (got "${value}")`);
            return fallback;
        }
        return n;
    };

    const minSeverity = severity('min-severity', first(opts.minSeverity, env.AI_REVIEW_MIN_SEVERITY, file.min_severity), 'minor')!;
    const failOn = severity('fail-on', first(opts.failOn, env.AI_REVIEW_FAIL_ON, file.fail_on));
    const maxFiles = int('max-files', first<string | number>(opts.maxFiles, env.AI_REVIEW_MAX_FILES, file.max_files), 50, 0);
    const maxFileDiffLines = int('max-file-diff-lines', first<string | number>(opts.maxFileDiffLines, env.AI_REVIEW_MAX_FILE_DIFF_LINES, file.max_file_diff_lines), 1500, 1);
    const fileContextChars = int('file-context-chars', first<string | number>(opts.fileContextChars, env.AI_REVIEW_FILE_CONTEXT_CHARS, file.file_context_chars), 30_000, 0);
    const concurrency = int('concurrency', first<string | number>(opts.concurrency, env.AI_REVIEW_CONCURRENCY, file.concurrency), 2, 1);
    const timeoutSeconds = int('timeout', first(opts.timeout, env.AI_REVIEW_TIMEOUT), 120, 1);

    if (missing.length || invalid.length) {
        const lines = [
            ...(missing.length ? ['Missing required configuration:', ...missing.map((m) => `  - ${m}`)] : []),
            ...(invalid.length ? ['Invalid configuration:', ...invalid.map((m) => `  - ${m}`)] : []),
        ];
        throw new Error(lines.join('\n'));
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
        systemPromptPath: first(opts.systemPromptPath, env.SYSTEM_PROMPT_PATH, file.system_prompt_path),
        codeReviewPromptPath: first(opts.codeReviewPromptPath, env.CODE_REVIEW_PROMPT_PATH, file.code_review_prompt_path),
        s3Region: first(opts.s3Region, env.S3_REGION),
        s3AccessKey: first(opts.s3AccessKey, env.S3_ACCESS_KEY),
        s3SecretKey: first(opts.s3SecretKey, env.S3_SECRET_KEY),
        attribution: first(negatable(opts.attribution), envBool(env.AI_REVIEW_ATTRIBUTION)) ?? true,
        include: first(list(opts.include), list(env.AI_REVIEW_INCLUDE), list(file.include)) || [],
        exclude: first(list(opts.exclude), list(env.AI_REVIEW_EXCLUDE), list(file.exclude)) || [],
        defaultExcludes: first(negatable(opts.defaultExcludes), envBool(env.AI_REVIEW_DEFAULT_EXCLUDES), file.default_excludes) ?? true,
        minSeverity,
        failOn,
        maxFiles,
        maxFileDiffLines,
        fileContextChars,
        concurrency,
        timeoutMs: timeoutSeconds * 1000,
        dryRun: first(opts.dryRun || undefined, envBool(env.AI_REVIEW_DRY_RUN)) ?? false,
        incremental: first(negatable(opts.incremental), envBool(env.AI_REVIEW_INCREMENTAL), file.incremental) ?? true,
    };
}
