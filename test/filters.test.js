const test = require('node:test');
const assert = require('node:assert');
const {createPathFilter, globToRegExp, DEFAULT_EXCLUDES} = require('../lib/filters');

test('globs without a slash match the file name anywhere', () => {
    assert.ok(globToRegExp('*.lock').test('a/b/Gemfile.lock'));
    assert.ok(globToRegExp('package-lock.json').test('web/package-lock.json'));
    assert.ok(!globToRegExp('*.ts').test('a.tsx'));
});

test('** spans directories, * does not', () => {
    assert.ok(globToRegExp('src/**/*.ts').test('src/a/b/c.ts'));
    assert.ok(globToRegExp('src/**/*.ts').test('src/c.ts'));
    assert.ok(!globToRegExp('src/*.ts').test('src/a/c.ts'));
    assert.ok(globToRegExp('**/vendor/**').test('vendor/x.go'));
});

test('default excludes skip lockfiles and generated code but not source', () => {
    const keep = createPathFilter({include: [], exclude: DEFAULT_EXCLUDES});
    for (const p of ['package-lock.json', 'yarn.lock', 'go.sum', 'app/dist/x.js', 'a.min.js', 'api.pb.go']) {
        assert.strictEqual(keep(p), false, p);
    }
    for (const p of ['src/index.ts', 'lib/locker.go', 'README.md']) {
        assert.strictEqual(keep(p), true, p);
    }
});

test('include restricts, exclude wins over include', () => {
    const keep = createPathFilter({include: ['src/**'], exclude: ['**/*.test.ts']});
    assert.strictEqual(keep('src/a.ts'), true);
    assert.strictEqual(keep('docs/a.md'), false);
    assert.strictEqual(keep('src/a.test.ts'), false);
});
