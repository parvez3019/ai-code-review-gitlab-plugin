const test = require('node:test');
const assert = require('node:assert');
const {parseHunks, positionOf, defaultAnchor, findLine, renderForPrompt, chunkHunks, countChangedLines} = require('../lib/diff');

test('parseHunks numbers added, removed and context lines', () => {
    const [hunk] = parseHunks('@@ -10,3 +10,3 @@ fn()\n a\n-b\n+B\n c\n');
    assert.deepStrictEqual(hunk.lines.map((l) => [l.type, l.oldLine, l.newLine]), [
        [' ', 10, 10], ['-', 11, undefined], ['+', undefined, 11], [' ', 12, 12],
    ]);
});

test('an omitted hunk count means 1, not 0', () => {
    const [hunk] = parseHunks('@@ -5 +5 @@\n-old\n+new\n');
    assert.strictEqual(hunk.lines[0].oldLine, 5);
    assert.strictEqual(hunk.lines[1].newLine, 5);
});

test('a zero count (new file) starts at line 1', () => {
    const [hunk] = parseHunks('@@ -0,0 +1,2 @@\n+a\n+b\n');
    assert.deepStrictEqual(hunk.lines.map((l) => l.newLine), [1, 2]);
});

test('"\\ No newline at end of file" is ignored', () => {
    const hunks = parseHunks('@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n');
    assert.deepStrictEqual(hunks[0].lines.map((l) => l.type), ['-', '+']);
    assert.deepStrictEqual(positionOf(defaultAnchor(hunks)), {new_line: 1});
});

test('splits multiple hunks', () => {
    const hunks = parseHunks('@@ -1,2 +1,3 @@\n a\n+b\n c\n@@ -10,1 +11,2 @@\n x\n+y\n');
    assert.strictEqual(hunks.length, 2);
    assert.strictEqual(countChangedLines(hunks), 2);
});

test('positions: added → new_line, removed → old_line, context → both', () => {
    assert.deepStrictEqual(positionOf({type: '+', newLine: 3}), {new_line: 3});
    assert.deepStrictEqual(positionOf({type: '-', oldLine: 7}), {old_line: 7});
    assert.deepStrictEqual(positionOf({type: ' ', oldLine: 2, newLine: 3}), {new_line: 3, old_line: 2});
});

test('defaultAnchor prefers the last added line over trailing context', () => {
    const hunks = parseHunks('@@ -1,4 +1,5 @@\n a\n+b\n c\n d\n e\n');
    assert.deepStrictEqual(positionOf(defaultAnchor(hunks)), {new_line: 2});
});

test('findLine resolves model line references by side', () => {
    const hunks = parseHunks('@@ -1,2 +1,2 @@\n-x\n+y\n z\n');
    assert.strictEqual(findLine(hunks, 1, 'new').type, '+');
    assert.strictEqual(findLine(hunks, 1, 'old').type, '-');
    assert.strictEqual(findLine(hunks, 99, 'new'), undefined);
});

test('renderForPrompt labels each line', () => {
    const text = renderForPrompt(parseHunks('@@ -1,1 +1,1 @@\n-a\n+b\n'));
    assert.match(text, /old:1\s+- a/);
    assert.match(text, /new:1\s+\+ b/);
});

test('chunkHunks keeps hunks whole and respects the size limit', () => {
    const hunks = parseHunks('@@ -1,1 +1,2 @@\n a\n+b\n@@ -10,1 +11,2 @@\n x\n+y\n@@ -20,1 +21,2 @@\n p\n+q\n');
    assert.deepStrictEqual(chunkHunks(hunks, 4).map((c) => c.length), [2, 1]);
});
