const test = require('node:test');
const assert = require('node:assert');
const {AnthropicClient} = require('../lib/anthropic');
const {OpenAICompatibleClient} = require('../lib/openai');
const {Gemini} = require('../lib/gemini');
const {statusOf} = require('../lib/retry');
const {fakeServer} = require('./helpers');

const request = {system: 'SYS', user: 'DIFF'};

test('AnthropicClient caches the system prompt and reports usage', async () => {
    const srv = await fakeServer(() => ({body: {
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-test', stop_reason: 'end_turn',
        content: [{type: 'text', text: '{"comments":[]}'}],
        usage: {input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0},
    }}));
    try {
        const client = new AnthropicClient({apiKey: 'k', apiUrl: srv.url, model: 'claude-test'});
        const result = await client.complete(request);
        assert.strictEqual(result.text, '{"comments":[]}');
        assert.deepStrictEqual(result.usage, {inputTokens: 10, outputTokens: 5, cacheReadTokens: 90});
        const seen = srv.requests[0];
        assert.strictEqual(seen.path, '/v1/messages');
        assert.strictEqual(seen.headers.authorization, 'Bearer k');
        assert.deepStrictEqual(seen.body.system, [{type: 'text', text: 'SYS', cache_control: {type: 'ephemeral'}}]);
        assert.deepStrictEqual(seen.body.messages, [{role: 'user', content: 'DIFF'}]);
        assert.strictEqual(seen.body.temperature, undefined);
        assert.strictEqual(seen.body.fallbacks, undefined, 'no fallbacks through a custom base URL');
    } finally {
        srv.close();
    }
});

test('AnthropicClient keeps the HTTP status on errors so they can be retried', async () => {
    const srv = await fakeServer(() => ({status: 429, body: {type: 'error', error: {type: 'rate_limit_error', message: 'slow down'}}}));
    try {
        const client = new AnthropicClient({apiKey: 'k', apiUrl: srv.url});
        await assert.rejects(client.complete(request), (e) => statusOf(e) === 429);
    } finally {
        srv.close();
    }
});

test('AnthropicClient surfaces refusals as errors', async () => {
    const srv = await fakeServer(() => ({body: {
        id: 'msg_1', type: 'message', role: 'assistant', model: 'm', stop_reason: 'refusal',
        stop_details: {type: 'refusal', category: 'cyber'}, content: [], usage: {input_tokens: 1, output_tokens: 0},
    }}));
    try {
        const client = new AnthropicClient({apiKey: 'k', apiUrl: srv.url});
        await assert.rejects(client.complete(request), /declined.*cyber/);
    } finally {
        srv.close();
    }
});

test('OpenAICompatibleClient calls chat/completions', async () => {
    const srv = await fakeServer(() => ({body: {choices: [{message: {content: ' {"comments":[]} '}}], usage: {prompt_tokens: 3, completion_tokens: 2}}}));
    try {
        const client = new OpenAICompatibleClient({apiKey: 'sk', apiUrl: `${srv.url}/v1/`, model: 'gpt-test'});
        const result = await client.complete(request);
        assert.strictEqual(result.text, '{"comments":[]}');
        assert.deepStrictEqual(result.usage, {inputTokens: 3, outputTokens: 2});
        const seen = srv.requests[0];
        assert.strictEqual(seen.path, '/v1/chat/completions');
        assert.strictEqual(seen.headers.authorization, 'Bearer sk');
        assert.deepStrictEqual(seen.body.messages, [{role: 'system', content: 'SYS'}, {role: 'user', content: 'DIFF'}]);
    } finally {
        srv.close();
    }
});

test('OpenAICompatibleClient sends no Authorization header without a key (Ollama)', async () => {
    const srv = await fakeServer(() => ({body: {choices: [{message: {content: 'ok'}}]}}));
    try {
        await new OpenAICompatibleClient({apiKey: '', apiUrl: srv.url, model: 'llama'}).complete(request);
        assert.strictEqual(srv.requests[0].headers.authorization, undefined);
    } finally {
        srv.close();
    }
});

test('Gemini sends the API key in a header, never in the URL', async () => {
    const srv = await fakeServer(() => ({body: {
        candidates: [{content: {parts: [{text: '{"comments":[]}'}]}}],
        usageMetadata: {promptTokenCount: 7, candidatesTokenCount: 3},
    }}));
    try {
        const client = new Gemini({apiKey: 'SECRET', apiUrl: srv.url, model: 'gemini-test'});
        const result = await client.complete(request);
        assert.strictEqual(result.text, '{"comments":[]}');
        const seen = srv.requests[0];
        assert.strictEqual(seen.path, '/v1beta/models/gemini-test:generateContent');
        assert.deepStrictEqual(seen.query, {});
        assert.strictEqual(seen.headers['x-goog-api-key'], 'SECRET');
        assert.doesNotMatch(seen.headers['user-agent'] || '', /Mozilla/);
        assert.deepStrictEqual(seen.body.systemInstruction, {parts: [{text: 'SYS'}]});
    } finally {
        srv.close();
    }
});

test('Gemini errors keep their HTTP status', async () => {
    const srv = await fakeServer(() => ({status: 429, body: {error: {message: 'quota'}}}));
    try {
        await assert.rejects(new Gemini({apiKey: 'k', apiUrl: srv.url}).complete(request), (e) => statusOf(e) === 429);
    } finally {
        srv.close();
    }
});
