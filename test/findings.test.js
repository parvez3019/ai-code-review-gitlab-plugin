const test = require('node:test');
const assert = require('node:assert');
const {parseFindings, formatFinding} = require('../lib/findings');

test('parses the JSON contract', () => {
    const {findings, unstructured} = parseFindings('{"comments":[{"line":3,"side":"new","severity":"Major","comment":"Bug"}]}');
    assert.strictEqual(unstructured, undefined);
    assert.deepStrictEqual(findings, [{line: 3, side: 'new', severity: 'major', comment: 'Bug', suggestion: undefined}]);
});

test('tolerates code fences and prose around the JSON', () => {
    assert.strictEqual(parseFindings('```json\n{"comments":[{"line":1,"comment":"x"}]}\n```').findings.length, 1);
    assert.strictEqual(parseFindings('Here you go:\n{"comments":[]}\nThanks').findings.length, 0);
});

test('treats every spelling of 204 as no feedback', () => {
    for (const text of ['204', ' 204. ', '`204`', '"204"', '**204**', '']) {
        assert.deepStrictEqual(parseFindings(text), {findings: []}, JSON.stringify(text));
    }
});

test('keeps non-JSON answers as one unstructured finding', () => {
    const result = parseFindings('- Possible null dereference');
    assert.strictEqual(result.unstructured, true);
    assert.strictEqual(result.findings[0].comment, '- Possible null dereference');
});

test('drops empty comments and defaults unknown severities to minor', () => {
    const {findings} = parseFindings('{"comments":[{"comment":""},{"comment":"x","severity":"blocker","line":"abc"}]}');
    assert.deepStrictEqual(findings, [{comment: 'x', severity: 'minor', line: undefined, side: undefined, suggestion: undefined}]);
});

test('formats a GitLab suggestion block only when allowed', () => {
    const finding = {severity: 'critical', comment: 'Off by one', suggestion: 'for (i = 0; i < n; i++)'};
    assert.match(formatFinding(finding, {allowSuggestion: true}), /```suggestion:-0\+0\nfor \(i = 0; i < n; i\+\+\)\n```/);
    assert.doesNotMatch(formatFinding(finding, {allowSuggestion: false}), /suggestion/);
    assert.match(formatFinding(finding, {allowSuggestion: false}), /Critical/);
});
