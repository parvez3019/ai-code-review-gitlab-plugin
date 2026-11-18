const test = require('node:test');
const assert = require('node:assert');
const {getDiffBlocks, getLineObj} = require('../lib/utils');

const LINE_REGEX = /@@\s-(\d+)(?:,(\d+))?\s\+(\d+)(?:,(\d+))?\s@@/;

test('getDiffBlocks splits a diff into hunks', () => {
    const diff = '@@ -1,2 +1,3 @@\n a\n+b\n c\n@@ -10,1 +11,2 @@\n x\n+y\n';
    const blocks = getDiffBlocks(diff);
    assert.strictEqual(blocks.length, 2);
    assert.ok(blocks[0].startsWith('@@ -1,2 +1,3 @@'));
    assert.ok(blocks[1].startsWith('@@ -10,1 +11,2 @@'));
});

test('getLineObj anchors to new_line when the hunk ends with an addition', () => {
    const hunk = '@@ -1,2 +1,3 @@\n a\n c\n+b\n';
    assert.deepStrictEqual(getLineObj(LINE_REGEX.exec(hunk), hunk), {new_line: 3});
});

test('getLineObj anchors to old_line when the hunk ends with a deletion', () => {
    const hunk = '@@ -5,3 +5,2 @@\n a\n b\n-c\n';
    assert.deepStrictEqual(getLineObj(LINE_REGEX.exec(hunk), hunk), {old_line: 7});
});

test('getLineObj sets both lines when the hunk ends with context', () => {
    const hunk = '@@ -1,2 +1,3 @@\n a\n+b\n c\n';
    assert.deepStrictEqual(getLineObj(LINE_REGEX.exec(hunk), hunk), {new_line: 3, old_line: 2});
});

test('isExcluded matches names in any directory, paths and ** globs', () => {
    const {isExcluded} = require('../lib/utils');
    assert.ok(isExcluded('package-lock.json', ['package-lock.json']));
    assert.ok(isExcluded('web/package-lock.json', ['package-lock.json']));
    assert.ok(isExcluded('src/__snapshots__/a.test.ts.snap', ['*.snap']));
    assert.ok(isExcluded('dist/a/b.js', ['dist/**']));
    assert.ok(isExcluded('api/v1/x.pb.go', ['**/*.pb.go']));
    assert.ok(isExcluded('x.pb.go', ['**/*.pb.go']));
    assert.ok(isExcluded('src/gen/a.ts', ['src/gen/*.ts']));
    assert.ok(!isExcluded('src/gen/sub/a.ts', ['src/gen/*.ts']));
    assert.ok(!isExcluded('src/app.ts', ['*.snap', 'package-lock.json']));
    assert.ok(!isExcluded('my-package-lock.json.ts', ['package-lock.json']));
    assert.ok(!isExcluded(undefined, ['*']));
});
