const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const {AnthropicClient} = require('../lib/anthropic');
const {OpenAICompatibleClient} = require('../lib/openai');

/** Start a throwaway HTTP server that records the request and returns `reply`. */
function fakeServer(reply, status = 200) {
    return new Promise((resolve) => {
        const seen = {};
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                Object.assign(seen, {method: req.method, url: req.url, headers: req.headers, body: JSON.parse(body)});
                res.writeHead(status, {'content-type': 'application/json'});
                res.end(JSON.stringify(reply));
            });
        });
        server.listen(0, '127.0.0.1', () => {
            resolve({server, seen, url: `http://127.0.0.1:${server.address().port}`});
        });
    });
}

const prompts = {systemPrompt: 'SYS', codeReviewPrompt: 'REVIEW'};

test('AnthropicClient calls the Messages API and returns text', async () => {
    const {server, seen, url} = await fakeServer({content: [{type: 'text', text: 'looks good'}]});
    try {
        const client = new AnthropicClient({apiKey: 'k', apiUrl: url, model: 'claude-test', ...prompts});
        assert.strictEqual(await client.reviewCodeChange('@@ -1 +1 @@\n+x'), 'looks good');
        assert.strictEqual(seen.url, '/v1/messages');
        assert.strictEqual(seen.headers['x-api-key'], 'k');
        assert.strictEqual(seen.headers['anthropic-version'], '2023-06-01');
        assert.strictEqual(seen.body.model, 'claude-test');
        assert.strictEqual(seen.body.system, 'SYS\n\nREVIEW');
        assert.deepStrictEqual(seen.body.messages, [{role: 'user', content: '@@ -1 +1 @@\n+x'}]);
    } finally {
        server.close();
    }
});

test('OpenAICompatibleClient calls chat/completions and returns content', async () => {
    const {server, seen, url} = await fakeServer({choices: [{message: {content: ' 204 '}}]});
    try {
        const client = new OpenAICompatibleClient({apiKey: 'sk', apiUrl: `${url}/v1/`, model: 'gpt-test', ...prompts});
        assert.strictEqual(await client.reviewCodeChange('diff'), '204');
        assert.strictEqual(seen.url, '/v1/chat/completions');
        assert.strictEqual(seen.headers.authorization, 'Bearer sk');
        assert.strictEqual(seen.body.messages[0].role, 'system');
    } finally {
        server.close();
    }
});

test('OpenAICompatibleClient sends no Authorization header without a key (Ollama)', async () => {
    const {server, seen, url} = await fakeServer({choices: [{message: {content: 'ok'}}]});
    try {
        const client = new OpenAICompatibleClient({apiKey: '', apiUrl: url, model: 'llama', ...prompts});
        await client.reviewCodeChange('diff');
        assert.strictEqual(seen.headers.authorization, undefined);
    } finally {
        server.close();
    }
});

test('provider errors keep the HTTP status so 429s can be retried', async () => {
    const {server, url} = await fakeServer({error: 'rate limited'}, 429);
    const origError = console.error;
    console.error = () => {};
    try {
        const client = new OpenAICompatibleClient({apiKey: 'k', apiUrl: url, model: 'm', ...prompts});
        await assert.rejects(client.reviewCodeChange('diff'), (e) => e.response.status === 429);
    } finally {
        console.error = origError;
        server.close();
    }
});
