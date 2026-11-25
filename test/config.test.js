const test = require('node:test');
const assert = require('node:assert');
const {resolveConfig} = require('../lib/config');

const ciEnv = {
    CI_API_V4_URL: 'https://gitlab.example.com/api/v4',
    CI_MERGE_REQUEST_PROJECT_ID: '42',
    CI_MERGE_REQUEST_IID: '7',
    CODE_REVIEW_GITLAB_TOKEN: 'glpat-x',
};

test('picks up GitLab CI predefined variables with zero flags', () => {
    const cfg = resolveConfig({}, {...ciEnv, GEMINI_API_KEY: 'g'});
    assert.strictEqual(cfg.gitlabApiUrl, 'https://gitlab.example.com/api/v4');
    assert.strictEqual(cfg.projectId, '42');
    assert.strictEqual(cfg.mergeRequestId, '7');
    assert.strictEqual(cfg.gitlabAccessToken, 'glpat-x');
    assert.strictEqual(cfg.provider, 'gemini');
    assert.strictEqual(cfg.apiKey, 'g');
    assert.strictEqual(cfg.attribution, true);
});

test('CLI flags override environment variables', () => {
    const cfg = resolveConfig(
        {projectId: '1', mergeRequestId: '2', gitlabApiUrl: 'https://x/api/v4', aiProvider: 'anthropic', apiKey: 'flag'},
        {...ciEnv, ANTHROPIC_API_KEY: 'env'},
    );
    assert.strictEqual(cfg.projectId, '1');
    assert.strictEqual(cfg.mergeRequestId, '2');
    assert.strictEqual(cfg.gitlabApiUrl, 'https://x/api/v4');
    assert.strictEqual(cfg.apiKey, 'flag');
});

test('defaults to gitlab.com when CI_API_V4_URL is not set', () => {
    const {CI_API_V4_URL, ...env} = ciEnv;
    const cfg = resolveConfig({}, {...env, GEMINI_API_KEY: 'g'});
    assert.strictEqual(cfg.gitlabApiUrl, 'https://gitlab.com/api/v4');
});

test('bedrock reads standard AWS env vars', () => {
    const cfg = resolveConfig({}, {
        ...ciEnv, AI_PROVIDER: 'bedrock', AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 's',
        AWS_REGION: 'eu-west-1', AWS_BEDROCK_MODEL: 'm',
    });
    assert.deepStrictEqual(
        [cfg.provider, cfg.apiKey, cfg.apiSecret, cfg.region, cfg.model],
        ['bedrock', 'a', 's', 'eu-west-1', 'm'],
    );
});

test('openai provider allows no API key (Ollama) but requires a model', () => {
    const cfg = resolveConfig({}, {...ciEnv, AI_PROVIDER: 'openai', OPENAI_BASE_URL: 'http://ollama:11434/v1', AI_MODEL: 'qwen'});
    assert.strictEqual(cfg.apiKey, undefined);
    assert.strictEqual(cfg.apiUrl, 'http://ollama:11434/v1');
    assert.throws(() => resolveConfig({}, {...ciEnv, AI_PROVIDER: 'openai'}), /model/);
});

test('reports every missing setting at once', () => {
    assert.throws(() => resolveConfig({}, {}), (err) =>
        /GitLab access token/.test(err.message) && /project ID/.test(err.message) &&
        /merge request IID/.test(err.message) && /Gemini API key/.test(err.message));
});

test('rejects unknown providers', () => {
    assert.throws(() => resolveConfig({aiProvider: 'nope'}, ciEnv), /Unsupported AI provider: nope/);
});

test('attribution can be disabled by flag or env var', () => {
    const env = {...ciEnv, GEMINI_API_KEY: 'g'};
    assert.strictEqual(resolveConfig({attribution: false}, env).attribution, false);
    assert.strictEqual(resolveConfig({}, {...env, AI_REVIEW_ATTRIBUTION: 'false'}).attribution, false);
});

test('new review settings have safe defaults', () => {
    const cfg = resolveConfig({}, {...ciEnv, GEMINI_API_KEY: 'g'});
    assert.deepStrictEqual(
        [cfg.minSeverity, cfg.failOn, cfg.maxFiles, cfg.concurrency, cfg.dryRun, cfg.incremental, cfg.defaultExcludes, cfg.timeoutMs],
        ['minor', undefined, 50, 2, false, true, true, 120000],
    );
});

test('precedence is CLI flag, then env var, then config file', () => {
    const env = {...ciEnv, GEMINI_API_KEY: 'g', AI_REVIEW_MIN_SEVERITY: 'major'};
    const file = {min_severity: 'critical', max_files: 5, exclude: ['docs/**'], incremental: false};
    const fromEnv = resolveConfig({}, env, file);
    assert.strictEqual(fromEnv.minSeverity, 'major');
    assert.strictEqual(fromEnv.maxFiles, 5);
    assert.deepStrictEqual(fromEnv.exclude, ['docs/**']);
    assert.strictEqual(fromEnv.incremental, false);
    assert.strictEqual(resolveConfig({minSeverity: 'minor'}, env, file).minSeverity, 'minor');
    assert.deepStrictEqual(resolveConfig({exclude: 'a/**, b/**'}, env, file).exclude, ['a/**', 'b/**']);
});

test('commander --no-x defaults (true) do not override env or file settings', () => {
    const cfg = resolveConfig({incremental: true, attribution: true, defaultExcludes: true},
        {...ciEnv, GEMINI_API_KEY: 'g', AI_REVIEW_INCREMENTAL: 'false'}, {default_excludes: false});
    assert.strictEqual(cfg.incremental, false);
    assert.strictEqual(cfg.defaultExcludes, false);
});

test('rejects invalid severities and numbers', () => {
    assert.throws(() => resolveConfig({minSeverity: 'huge', maxFiles: '-1'}, {...ciEnv, GEMINI_API_KEY: 'g'}),
        (err) => /min-severity/.test(err.message) && /max-files/.test(err.message));
    assert.strictEqual(resolveConfig({failOn: 'none'}, {...ciEnv, GEMINI_API_KEY: 'g'}).failOn, undefined);
});
