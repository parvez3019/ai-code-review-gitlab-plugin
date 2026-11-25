const test = require('node:test');
const assert = require('node:assert');
const {runReview} = require('../lib/review');
const {GitLab} = require('../lib/gitlab');
const {retryDefaults} = require('../lib/retry');
const {fakeServer, quiet} = require('./helpers');

retryDefaults.baseDelayMs = 1;
retryDefaults.maxDelayMs = 5;

const MR = '/api/v4/projects/1/merge_requests/2';
const HEAD = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PREV = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function file(path, diff, extra = {}) {
    return {old_path: path, new_path: path, diff, new_file: false, renamed_file: false, deleted_file: false, ...extra};
}

/** A fake GitLab with in-memory discussions; diffs are served two per page to exercise pagination. */
async function fakeGitLab({diffs, discussions = [], compare, rejectLine}) {
    const state = {discussions: discussions.slice(), posted: [], notes: [], updated: []};
    const srv = await fakeServer(({method, path, query, body}) => {
        if (method === 'GET' && path === MR) {
            return {body: {title: 'Add feature', description: 'Adds a thing', diff_refs: {base_sha: 'base', start_sha: 'start', head_sha: HEAD}}};
        }
        if (method === 'GET' && path === `${MR}/diffs`) {
            const page = Number(query.page);
            const slice = diffs.slice((page - 1) * 2, page * 2);
            const hasNext = page * 2 < diffs.length;
            return {body: slice, headers: {'x-next-page': hasNext ? String(page + 1) : ''}};
        }
        if (method === 'GET' && path === `${MR}/discussions`) {
            return {body: state.discussions, headers: {'x-next-page': ''}};
        }
        if (method === 'GET' && path.startsWith('/api/v4/projects/1/repository/files/')) {
            return {body: 'full file content'};
        }
        if (method === 'GET' && path === '/api/v4/projects/1/repository/compare') {
            return compare ? {body: {diffs: compare.map((p) => ({old_path: p, new_path: p}))}} : {status: 404, body: {}};
        }
        if (method === 'POST' && path === `${MR}/discussions`) {
            if (rejectLine && body.position.new_line === rejectLine) {
                return {status: 400, body: {message: 'line_code is invalid'}};
            }
            state.posted.push(body);
            state.discussions.push({id: `d${state.discussions.length}`, notes: [{id: 100 + state.discussions.length, body: body.body}]});
            return {status: 201, body: {}};
        }
        if (method === 'POST' && path === `${MR}/notes`) {
            state.notes.push(body.body);
            state.discussions.push({id: `n${state.discussions.length}`, notes: [{id: 500 + state.notes.length, body: body.body}]});
            return {status: 201, body: {}};
        }
        if (method === 'PUT' && path.startsWith(`${MR}/notes/`)) {
            state.updated.push({id: Number(path.split('/').pop()), body: body.body});
            return {body: {}};
        }
        return undefined;
    });
    const gitlab = new GitLab({gitlabApiUrl: `${srv.url}/api/v4`, gitlabAccessToken: 't', projectId: '1', mergeRequestId: '2'});
    return {srv, gitlab, state};
}

/** Fake model: answers per file from `answers`, keyed by the "File: <path>" line in the prompt. */
function fakeAI(answers) {
    const calls = [];
    return {
        calls,
        async complete({system, user}) {
            calls.push({system, user});
            const path = /^File: (\S+)/m.exec(user)[1];
            const answer = answers[path];
            if (answer instanceof Error) throw answer;
            if (typeof answer === 'function') return answer();
            return {text: typeof answer === 'string' ? answer : JSON.stringify(answer ?? {comments: []}), usage: {inputTokens: 10, outputTokens: 2}};
        },
    };
}

const options = (extra = {}) => ({
    systemPrompt: 'SYS', include: [], exclude: [], defaultExcludes: true, minSeverity: 'minor', maxFiles: 50,
    maxFileDiffLines: 1500, fileContextChars: 30000, concurrency: 2, dryRun: false, incremental: true, attribution: true, ...extra,
});

const DIFF_A = '@@ -1,3 +1,4 @@\n a\n+bug()\n b\n c\n';
const DIFF_B = '@@ -10,2 +10,2 @@\n x\n-y\n+z\n';

test('reviews every page of diffs, posts inline comments on the exact line and one summary note', async () => {
    const diffs = [
        file('src/a.ts', DIFF_A),
        file('src/b.ts', DIFF_B),
        file('package-lock.json', '@@ -1 +1 @@\n-1\n+2\n'),
        file('src/c.ts', DIFF_A),
        file('src/gone.ts', '@@ -1 +0,0 @@\n-x\n', {deleted_file: true}),
    ];
    const {srv, gitlab, state} = await fakeGitLab({diffs});
    const ai = fakeAI({
        'src/a.ts': {comments: [{line: 2, side: 'new', severity: 'major', comment: 'bug() throws', suggestion: 'safe()'}]},
        'src/b.ts': '204',
    });
    try {
        const result = await quiet(() => runReview(options(), gitlab, ai));
        assert.strictEqual(result.exitCode, 0);
        assert.deepStrictEqual(ai.calls.map((c) => /^File: (\S+)/m.exec(c.user)[1]).sort(), ['src/a.ts', 'src/b.ts', 'src/c.ts']);
        assert.match(ai.calls[0].user, /Merge request: Add feature/);
        assert.match(ai.calls[0].user, /full file content/);

        assert.strictEqual(state.posted.length, 1);
        const [comment] = state.posted;
        assert.strictEqual(comment.position.new_line, 2);
        assert.strictEqual(comment.position.old_line, undefined);
        assert.strictEqual(comment.position.head_sha, HEAD);
        assert.match(comment.body, /Major.*bug\(\) throws/);
        assert.match(comment.body, /```suggestion:-0\+0\nsafe\(\)\n```/);

        assert.strictEqual(state.notes.length, 1);
        const summary = state.notes[0];
        assert.match(summary, /Reviewed \*\*3\*\* file/);
        assert.match(summary, /1 excluded by path filters/);
        assert.match(summary, new RegExp(`summary sha=${HEAD}`));
        assert.match(summary, /Reviewed by/);
    } finally {
        srv.close();
    }
});

test('a second run on the same commit does nothing', async () => {
    const summaryNote = {id: 'd0', notes: [{id: 42, body: `### 🤖 AI code review\n<!-- ai-code-review:summary sha=${HEAD} -->`}]};
    const {srv, gitlab, state} = await fakeGitLab({diffs: [file('src/a.ts', DIFF_A)], discussions: [summaryNote]});
    const ai = fakeAI({});
    try {
        const result = await quiet(() => runReview(options(), gitlab, ai));
        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(ai.calls.length, 0);
        assert.strictEqual(state.posted.length + state.notes.length + state.updated.length, 0);
    } finally {
        srv.close();
    }
});

test('a new push reviews only changed files, skips repeated comments and updates the summary in place', async () => {
    const existing = [
        {id: 'd0', notes: [{id: 42, body: `summary\n<!-- ai-code-review:summary sha=${PREV} -->`}]},
        {id: 'd1', notes: [{id: 43, body: 'old\n<!-- ai-code-review:finding src%2Fa.ts@2: -->'}]},
    ];
    const {srv, gitlab, state} = await fakeGitLab({
        diffs: [file('src/a.ts', DIFF_A), file('src/b.ts', DIFF_B)],
        discussions: existing,
        compare: ['src/a.ts'],
    });
    const ai = fakeAI({'src/a.ts': {comments: [{line: 2, side: 'new', severity: 'major', comment: 'same issue again'}]}});
    try {
        const result = await quiet(() => runReview(options(), gitlab, ai));
        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(ai.calls.length, 1, 'src/b.ts did not change since the last review');
        assert.strictEqual(result.duplicates, 1);
        assert.strictEqual(state.posted.length, 0);
        assert.strictEqual(state.notes.length, 0);
        assert.strictEqual(state.updated.length, 1);
        assert.strictEqual(state.updated[0].id, 42);
        assert.match(state.updated[0].body, /changes since `aaaaaaaa`/);
        assert.match(state.updated[0].body, /1 unchanged since the last review/);
    } finally {
        srv.close();
    }
});

test('failures fail the job and keep the checkpoint so the next run retries', async () => {
    const {srv, gitlab, state} = await fakeGitLab({diffs: [file('src/a.ts', DIFF_A), file('src/b.ts', DIFF_B)]});
    const ai = fakeAI({'src/a.ts': Object.assign(new Error('boom'), {response: {status: 400, data: {error: {message: 'bad request'}}}})});
    try {
        const result = await quiet(() => runReview(options(), gitlab, ai));
        assert.strictEqual(result.exitCode, 1);
        assert.deepStrictEqual(result.failures.map((f) => f.path), ['src/a.ts']);
        assert.match(state.notes[0], /Not reviewed because of errors/);
        assert.match(state.notes[0], /summary sha= -->/);
    } finally {
        srv.close();
    }
});

test('rate limits are retried a bounded number of times', async () => {
    const {srv, gitlab} = await fakeGitLab({diffs: [file('src/a.ts', DIFF_A)]});
    let attempts = 0;
    const ai = fakeAI({
        'src/a.ts': () => {
            attempts++;
            if (attempts < 3) throw Object.assign(new Error('rate limited'), {status: 429});
            return {text: '{"comments":[]}'};
        },
    });
    try {
        const result = await quiet(() => runReview(options(), gitlab, ai));
        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(attempts, 3);
    } finally {
        srv.close();
    }
});

test('comments on lines outside the diff go to the last changed line; rejected positions become general notes', async () => {
    const {srv, gitlab, state} = await fakeGitLab({
        diffs: [file('src/a.ts', DIFF_A), file('src/b.ts', DIFF_B)],
        rejectLine: 10,
    });
    const ai = fakeAI({
        'src/a.ts': {comments: [{line: 99, side: 'new', severity: 'minor', comment: 'elsewhere', suggestion: 'x'}]},
        'src/b.ts': {comments: [{line: 10, side: 'new', severity: 'critical', comment: 'broken'}]},
    });
    try {
        const result = await quiet(() => runReview(options({concurrency: 1}), gitlab, ai));
        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(state.posted.length, 1);
        assert.strictEqual(state.posted[0].position.new_line, 2);
        assert.match(state.posted[0].body, /refers to line 99/);
        assert.doesNotMatch(state.posted[0].body, /suggestion/, 'no suggestion on a fallback line');
        const fallback = state.notes.find((n) => n.includes('broken'));
        assert.match(fallback, /`src\/b.ts` line 10/);
    } finally {
        srv.close();
    }
});

test('min-severity filters comments and fail-on sets the exit code', async () => {
    const {srv, gitlab, state} = await fakeGitLab({diffs: [file('src/a.ts', DIFF_A)]});
    const ai = fakeAI({'src/a.ts': {comments: [
        {line: 2, side: 'new', severity: 'minor', comment: 'nit'},
        {line: 2, side: 'new', severity: 'critical', comment: 'sql injection'},
    ]}});
    try {
        const result = await quiet(() => runReview(options({minSeverity: 'major', failOn: 'critical'}), gitlab, ai));
        assert.strictEqual(result.exitCode, 1);
        assert.strictEqual(state.posted.length, 1);
        assert.match(state.posted[0].body, /sql injection/);
    } finally {
        srv.close();
    }
});

test('dry run posts nothing and prints the comments', async () => {
    const {srv, gitlab, state} = await fakeGitLab({diffs: [file('src/a.ts', DIFF_A)]});
    const ai = fakeAI({'src/a.ts': {comments: [{line: 2, side: 'new', severity: 'major', comment: 'dry'}]}});
    try {
        const logs = [];
        const result = await quiet(async (captured) => {
            const r = await runReview(options({dryRun: true}), gitlab, ai);
            logs.push(...captured);
            return r;
        });
        assert.strictEqual(result.posted, 1);
        assert.strictEqual(state.posted.length + state.notes.length + state.updated.length, 0);
        assert.ok(logs.some((l) => l.includes('[dry run] src/a.ts:2')));
    } finally {
        srv.close();
    }
});

test('max-files and max-file-diff-lines limits are reported in the summary', async () => {
    const big = '@@ -1,1 +1,4 @@\n a\n+1\n+2\n+3\n';
    const {srv, gitlab, state} = await fakeGitLab({
        diffs: [file('src/a.ts', DIFF_A), file('src/big.ts', big), file('src/b.ts', DIFF_B), file('src/c.ts', DIFF_B)],
    });
    const ai = fakeAI({});
    try {
        await quiet(() => runReview(options({maxFiles: 2, maxFileDiffLines: 2}), gitlab, ai));
        assert.strictEqual(ai.calls.length, 2);
        assert.match(state.notes[0], /Too large to review: `src\/big.ts`/);
        assert.match(state.notes[0], /Over the file limit: `src\/c.ts`/);
    } finally {
        srv.close();
    }
});
