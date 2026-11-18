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
