import {AICodeReviewClient, TokenUsage} from './ai-client';
import {
    chunkHunks, countChangedLines, defaultAnchor, DiffLine, findLine, Hunk, LinePosition, parseHunks, positionOf,
} from './diff';
import {createPathFilter, DEFAULT_EXCLUDES} from './filters';
import {Finding, formatFinding, parseFindings, Severity, severityRank} from './findings';
import {Discussion, FileDiff, GitLab, MergeRequestInfo} from './gitlab';
import {buildUserPrompt} from './prompts';
import {describeError, statusOf, withRetry} from './retry';

export interface ReviewOptions {
    systemPrompt: string;
    include: string[];
    exclude: string[];
    defaultExcludes: boolean;
    minSeverity: Severity;
    failOn?: Severity;
    maxFiles: number;
    maxFileDiffLines: number;
    fileContextChars: number;
    concurrency: number;
    dryRun: boolean;
    incremental: boolean;
    attribution: boolean;
}

export interface ReviewResult {
    exitCode: number;
    reviewedFiles: number;
    posted: number;
    duplicates: number;
    failures: Array<{path: string; message: string}>;
    usage: TokenUsage;
}

/** Diff lines sent to the model per request; bigger files are reviewed in several parts. */
const LINES_PER_REQUEST = 600;

const SUMMARY_MARKER = /<!-- ai-code-review:summary sha=([0-9a-f]*) -->/;
const FINDING_MARKER = /<!-- ai-code-review:finding (\S+) -->/g;

const ATTRIBUTION_FOOTER =
    '\n\n---\n<sub>🤖 Reviewed by [ai-code-review-gitlab-plugin](https://github.com/parvez3019/ai-code-review-gitlab-plugin)</sub>';

interface PlannedComment {
    file: FileDiff;
    line: DiffLine;
    position: LinePosition;
    finding: Finding;
    note?: string;
    exactLine: boolean;
}

interface FileOutcome {
    path: string;
    comments: PlannedComment[];
    severities: Severity[];
    error?: string;
}

export function findingKey(path: string, position: LinePosition): string {
    return `${encodeURIComponent(path)}@${position.new_line ?? ''}:${position.old_line ?? ''}`;
}

function scanDiscussions(discussions: Discussion[]) {
    const keys = new Set<string>();
    let summary: {id: number; sha: string} | undefined;
    for (const discussion of discussions) {
        for (const note of discussion.notes || []) {
            if (note.system || !note.body) continue;
            const summaryMatch = SUMMARY_MARKER.exec(note.body);
            if (summaryMatch && !summary) {
                summary = {id: note.id, sha: summaryMatch[1]};
            }
            for (const match of note.body.matchAll(FINDING_MARKER)) {
                keys.add(match[1]);
            }
        }
    }
    return {keys, summary};
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const workers = Array.from({length: Math.min(limit, items.length)}, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]);
        }
    });
    await Promise.all(workers);
    return results;
}

const lineNumber = (p: LinePosition) => p.new_line ?? p.old_line;

export async function runReview(options: ReviewOptions, gitlab: GitLab, ai: AICodeReviewClient): Promise<ReviewResult> {
    const usage: TokenUsage = {inputTokens: 0, outputTokens: 0, cacheReadTokens: 0};
    const failures: Array<{path: string; message: string}> = [];

    const mr: MergeRequestInfo = await gitlab.getMergeRequest();
    const refs = mr.diff_refs;
    if (!refs?.head_sha) {
        throw new Error('The merge request has no diff yet (diff_refs is empty). Try again once GitLab has processed it.');
    }

    const discussions = await gitlab.listDiscussions();
    const {keys: existingKeys, summary} = scanDiscussions(discussions);
    const incremental = options.incremental && !options.dryRun;

    if (incremental && summary?.sha === refs.head_sha) {
        console.log(`Commit ${refs.head_sha.slice(0, 8)} was already reviewed; nothing to do.`);
        return {exitCode: 0, reviewedFiles: 0, posted: 0, duplicates: 0, failures, usage};
    }

    const diffs = await gitlab.getDiffs();

    let changedSince: Set<string> | undefined;
    if (incremental && summary?.sha) {
        changedSince = await gitlab.getChangedPaths(summary.sha, refs.head_sha);
        console.log(changedSince
            ? `Incremental review: ${changedSince.size} path(s) changed since ${summary.sha.slice(0, 8)}`
            : `Cannot compare with the last reviewed commit ${summary.sha.slice(0, 8)} (force push?); reviewing every file.`);
    }

    // ---- Select files ----
    const pathFilter = createPathFilter({
        include: options.include,
        exclude: [...(options.defaultExcludes ? DEFAULT_EXCLUDES : []), ...options.exclude],
    });
    const skipped = {excluded: [] as string[], tooLarge: [] as string[], overLimit: [] as string[], unchanged: 0};
    let toReview: Array<{file: FileDiff; hunks: Hunk[]}> = [];

    for (const file of diffs) {
        if (file.deleted_file) continue;
        if (changedSince && !changedSince.has(file.new_path) && !changedSince.has(file.old_path)) {
            skipped.unchanged++;
            continue;
        }
        if (!pathFilter(file.new_path)) {
            skipped.excluded.push(file.new_path);
            continue;
        }
        if (file.too_large || (file.collapsed && !file.diff)) {
            skipped.tooLarge.push(file.new_path);
            continue;
        }
        const hunks = parseHunks(file.diff || '');
        if (!hunks.length) continue; // pure rename, mode change or binary file
        if (countChangedLines(hunks) > options.maxFileDiffLines) {
            skipped.tooLarge.push(file.new_path);
            continue;
        }
        toReview.push({file, hunks});
    }
    if (options.maxFiles > 0 && toReview.length > options.maxFiles) {
        skipped.overLimit = toReview.slice(options.maxFiles).map((f) => f.file.new_path);
        toReview = toReview.slice(0, options.maxFiles);
    }

    console.log(`Reviewing ${toReview.length} file(s)` +
        (skipped.excluded.length ? `, ${skipped.excluded.length} excluded` : '') +
        (skipped.tooLarge.length ? `, ${skipped.tooLarge.length} too large` : '') +
        (skipped.overLimit.length ? `, ${skipped.overLimit.length} over the file limit` : ''));

    // ---- Review ----
    const reviewFile = async ({file, hunks}: {file: FileDiff; hunks: Hunk[]}): Promise<FileOutcome> => {
        const outcome: FileOutcome = {path: file.new_path, comments: [], severities: []};
        try {
            let fileContent: string | undefined;
            if (options.fileContextChars > 0) {
                const content = await gitlab.getFileRaw(file.new_path, refs.head_sha);
                if (content && content.length <= options.fileContextChars) fileContent = content;
            }
            const chunks = chunkHunks(hunks, LINES_PER_REQUEST);
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const user = buildUserPrompt({
                    mrTitle: mr.title,
                    mrDescription: mr.description,
                    path: file.new_path,
                    oldPath: file.old_path,
                    newFile: file.new_file,
                    renamed: file.renamed_file,
                    fileContent,
                    hunks: chunk,
                    part: {index: i + 1, total: chunks.length},
                });
                const response = await withRetry(`Review ${file.new_path}`, () => ai.complete({system: options.systemPrompt, user}));
                if (response.usage) {
                    usage.inputTokens += response.usage.inputTokens;
                    usage.outputTokens += response.usage.outputTokens;
                    usage.cacheReadTokens! += response.usage.cacheReadTokens ?? 0;
                }
                const parsed = parseFindings(response.text);
                if (parsed.unstructured) {
                    console.warn(`${file.new_path}: the model did not answer in the expected JSON format; posting its answer as one comment.`);
                }
                for (const finding of parsed.findings) {
                    outcome.severities.push(finding.severity);
                    if (severityRank(finding.severity) < severityRank(options.minSeverity)) continue;
                    let line = finding.line ? findLine(chunk, finding.line, finding.side) : undefined;
                    const exactLine = !!line;
                    let note: string | undefined;
                    if (!line) {
                        line = defaultAnchor(chunk);
                        if (finding.line) note = `This comment refers to line ${finding.line}, which is not part of the diff.`;
                    }
                    if (!line) continue;
                    outcome.comments.push({file, line, position: positionOf(line), finding, note, exactLine});
                }
            }
            console.log(`${file.new_path}: ${outcome.comments.length} comment(s)`);
        } catch (error) {
            outcome.error = describeError(error);
            console.error(`Failed to review ${file.new_path}: ${outcome.error}`);
        }
        return outcome;
    };

    const outcomes = await mapConcurrent(toReview, Math.max(1, options.concurrency), reviewFile);

    // ---- Post comments ----
    let posted = 0;
    let duplicates = 0;
    const postedBySeverity: Record<Severity, number> = {critical: 0, major: 0, minor: 0};
    for (const outcome of outcomes) {
        if (outcome.error) {
            failures.push({path: outcome.path, message: outcome.error});
            continue;
        }
        for (const c of outcome.comments) {
            const key = findingKey(c.file.new_path, c.position);
            if (existingKeys.has(key)) {
                duplicates++;
                continue;
            }
            const body = formatFinding(c.finding, {allowSuggestion: c.exactLine && c.line.type !== '-', note: c.note}) +
                `\n\n<!-- ai-code-review:finding ${key} -->`;
            if (options.dryRun) {
                console.log(`\n[dry run] ${c.file.new_path}:${lineNumber(c.position)}\n${body}\n`);
                posted++;
                postedBySeverity[c.finding.severity]++;
                continue;
            }
            try {
                await gitlab.createDiscussion(body, {...c.position, old_path: c.file.old_path, new_path: c.file.new_path}, refs);
                posted++;
                postedBySeverity[c.finding.severity]++;
            } catch (error) {
                if (statusOf(error) === 400) {
                    // GitLab rejected the line position; keep the feedback as a general comment.
                    try {
                        await gitlab.createNote(`**\`${c.file.new_path}\` line ${lineNumber(c.position)}**\n\n${body}`);
                        posted++;
                        postedBySeverity[c.finding.severity]++;
                        continue;
                    } catch (noteError) {
                        error = noteError;
                    }
                }
                failures.push({path: c.file.new_path, message: `could not post a comment: ${describeError(error)}`});
            }
        }
    }

    // ---- Summary note ----
    const cleanFiles = outcomes.filter((o) => !o.error && o.comments.length === 0).map((o) => o.path);
    // Only advance the incremental checkpoint when everything was reviewed.
    const checkpoint = failures.length ? (summary?.sha ?? '') : refs.head_sha;
    const summaryBody = buildSummary({
        headSha: refs.head_sha,
        since: changedSince ? summary?.sha : undefined,
        reviewed: toReview.length,
        posted,
        postedBySeverity,
        duplicates,
        cleanFiles,
        skipped,
        failures,
        attribution: options.attribution,
        checkpoint,
    });
    if (options.dryRun) {
        console.log(`\n[dry run] summary note:\n${summaryBody}\n`);
    } else {
        try {
            if (summary) {
                await gitlab.updateNote(summary.id, summaryBody);
            } else {
                await gitlab.createNote(summaryBody);
            }
        } catch (error) {
            failures.push({path: '(summary note)', message: describeError(error)});
        }
    }

    // ---- Result ----
    console.log(`Done: ${toReview.length} file(s) reviewed, ${posted} comment(s) ${options.dryRun ? 'found' : 'posted'}` +
        (duplicates ? `, ${duplicates} already on the MR` : '') +
        `. Tokens: ${usage.inputTokens} input (${usage.cacheReadTokens} cached), ${usage.outputTokens} output.`);

    let exitCode = 0;
    if (failures.length) {
        console.error(`${failures.length} problem(s):\n${failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n')}`);
        exitCode = 1;
    }
    if (options.failOn) {
        const threshold = severityRank(options.failOn);
        const blocking = outcomes.flatMap((o) => o.severities).filter((s) => severityRank(s) >= threshold).length;
        if (blocking) {
            console.error(`${blocking} finding(s) at or above "${options.failOn}" severity (--fail-on).`);
            exitCode = 1;
        }
    }
    return {exitCode, reviewedFiles: toReview.length, posted, duplicates, failures, usage};
}

interface SummaryInput {
    headSha: string;
    since?: string;
    reviewed: number;
    posted: number;
    postedBySeverity: Record<Severity, number>;
    duplicates: number;
    cleanFiles: string[];
    skipped: {excluded: string[]; tooLarge: string[]; overLimit: string[]; unchanged: number};
    failures: Array<{path: string; message: string}>;
    attribution: boolean;
    checkpoint: string;
}

const code = (s: string) => `\`${s.replace(/`/g, "'")}\``;

function buildSummary(s: SummaryInput): string {
    const parts: string[] = ['### 🤖 AI code review'];
    parts.push(`Reviewed **${s.reviewed}** file(s) at ${code(s.headSha.slice(0, 8))}` +
        (s.since ? ` (changes since ${code(s.since.slice(0, 8))})` : '') + '.');

    if (s.posted) {
        const bySeverity = (['critical', 'major', 'minor'] as Severity[])
            .filter((sev) => s.postedBySeverity[sev])
            .map((sev) => `${s.postedBySeverity[sev]} ${sev}`)
            .join(', ');
        parts.push(`**${s.posted}** new comment(s): ${bySeverity}.`);
    } else if (s.reviewed) {
        parts.push('No new comments. 💪');
    }
    if (s.duplicates) {
        parts.push(`${s.duplicates} finding(s) were already commented on and were not repeated.`);
    }
    if (s.cleanFiles.length) {
        parts.push(`<details><summary>Files with no comments (${s.cleanFiles.length})</summary>\n\n` +
            s.cleanFiles.map((f) => `- ${code(f)}`).join('\n') + '\n\n</details>');
    }

    const skippedLines: string[] = [];
    if (s.skipped.unchanged) skippedLines.push(`- ${s.skipped.unchanged} unchanged since the last review`);
    if (s.skipped.excluded.length) skippedLines.push(`- ${s.skipped.excluded.length} excluded by path filters`);
    if (s.skipped.tooLarge.length) skippedLines.push(`- Too large to review: ${s.skipped.tooLarge.map(code).join(', ')}`);
    if (s.skipped.overLimit.length) skippedLines.push(`- Over the file limit: ${s.skipped.overLimit.map(code).join(', ')}`);
    if (skippedLines.length) {
        parts.push(`**Skipped**\n${skippedLines.join('\n')}`);
    }
    if (s.failures.length) {
        parts.push(`⚠️ **Not reviewed because of errors** (they will be retried on the next run)\n` +
            s.failures.map((f) => `- ${code(f.path)}: ${f.message}`).join('\n'));
    }

    return parts.join('\n\n') + (s.attribution ? ATTRIBUTION_FOOTER : '') +
        `\n<!-- ai-code-review:summary sha=${s.checkpoint} -->`;
}
