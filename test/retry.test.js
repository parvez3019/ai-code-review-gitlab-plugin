const test = require('node:test');
const assert = require('node:assert');
const {withRetry, retryDefaults, isRetryable, describeError} = require('../lib/retry');
const {quiet} = require('./helpers');

retryDefaults.baseDelayMs = 1;
retryDefaults.maxDelayMs = 5;

const httpError = (status) => Object.assign(new Error(`status ${status}`), {response: {status, headers: {}}});

test('retries 429 and 5xx, then succeeds', async () => {
    let calls = 0;
    const result = await quiet(() => withRetry('t', async () => {
        if (++calls < 3) throw httpError(calls === 1 ? 429 : 503);
        return 'ok';
    }));
    assert.strictEqual(result, 'ok');
    assert.strictEqual(calls, 3);
});

test('gives up after the retry limit instead of looping forever', async () => {
    let calls = 0;
    await quiet(() => assert.rejects(withRetry('t', async () => {
        calls++;
        throw httpError(429);
    }), /429/));
    assert.strictEqual(calls, retryDefaults.retries + 1);
});

test('does not retry client errors', async () => {
    let calls = 0;
    await assert.rejects(withRetry('t', async () => {
        calls++;
        throw httpError(400);
    }));
    assert.strictEqual(calls, 1);
});

test('recognises AWS SDK and Anthropic SDK errors', () => {
    assert.ok(isRetryable({$metadata: {httpStatusCode: 429}}));
    assert.ok(isRetryable({status: 529}));
    assert.ok(isRetryable({name: 'ThrottlingException'}));
    assert.ok(!isRetryable({status: 401}));
});

test('describeError never includes the request URL', () => {
    const error = Object.assign(new Error('Request failed with status code 403'), {
        config: {url: '/v1beta/models/x:generateContent?key=SECRET'},
        response: {status: 403, data: {error: {message: 'API key not valid'}}},
    });
    const text = describeError(error);
    assert.strictEqual(text, 'HTTP 403: API key not valid');
    assert.doesNotMatch(text, /SECRET/);
});
