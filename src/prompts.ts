import * as fs from 'fs';
import * as path from 'path';
import {S3Client, GetObjectCommand} from '@aws-sdk/client-s3';
import {Hunk, renderForPrompt} from './diff';

const DEFAULT_SYSTEM_PROMPT_PATH = path.join(__dirname, 'prompts/system_prompt.txt');
const DEFAULT_CODE_REVIEW_PROMPT_PATH = path.join(__dirname, 'prompts/code_review_prompt.txt');

/**
 * Appended to every system prompt, including custom ones, so the tool can always
 * parse the answer. Custom prompts only change *what* gets reviewed.
 */
export const OUTPUT_FORMAT = `## Output format (required)
Respond with a single JSON object and nothing else (no prose, no code fences):
{"comments": [{"line": 12, "side": "new", "severity": "major", "comment": "...", "suggestion": "..."}]}

- "line" and "side" must point at a line shown in the diff. Diff lines are labelled "new:N" (the line exists in the new file: added "+" or unchanged " ") or "old:N" (a removed "-" line). Use side "new" for new:N labels and "old" for old:N labels. Prefer added lines.
- "severity" is one of "critical", "major", "minor".
- "comment" is GitLab Markdown: the problem, why it matters and the fix.
- "suggestion" is optional: the exact code that should replace the commented line (one or more lines, no diff markers). Only include it for side "new" when you are confident it is correct and complete.
- If there is nothing significant to report, respond with {"comments": []}.
- This format overrides any other instruction about the response format (for example "reply with 204").`;

interface S3Location {
    bucket: string;
    key: string;
}

export interface S3Options {
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
}

function parseS3Path(s3Path: string): S3Location {
    const match = s3Path.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) {
        throw new Error(`Invalid S3 path: ${s3Path} (expected s3://bucket/key)`);
    }
    return {bucket: match[1], key: match[2]};
}

async function loadFromS3(location: S3Location, options: S3Options): Promise<string> {
    const client = new S3Client({
        region: options.region || process.env.AWS_REGION || 'us-east-1',
        credentials: options.accessKeyId && options.secretAccessKey
            ? {accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey}
            : undefined,
    });
    const response = await client.send(new GetObjectCommand({Bucket: location.bucket, Key: location.key}));
    const body = await response.Body?.transformToString();
    if (!body?.trim()) {
        throw new Error('the object is empty');
    }
    return body.trim();
}

/**
 * Load a prompt from a local file or s3://bucket/key. A custom prompt that cannot
 * be loaded is an error: silently using the default would hide a broken checklist.
 */
export async function loadPrompt(defaultPath: string, customPath?: string, s3?: S3Options): Promise<string> {
    const source = customPath || defaultPath;
    try {
        if (customPath?.startsWith('s3://')) {
            return await loadFromS3(parseS3Path(customPath), s3 || {});
        }
        const text = fs.readFileSync(source, 'utf-8').trim();
        if (!text) throw new Error('the file is empty');
        return text;
    } catch (error) {
        throw new Error(`Failed to load prompt from ${source}: ${error instanceof Error ? error.message : error}`);
    }
}

export interface PromptOptions {
    systemPromptPath?: string;
    codeReviewPromptPath?: string;
    s3?: S3Options;
}

/** Build the full system prompt once per run (identical for every call, so it caches well). */
export async function buildSystemPrompt(options: PromptOptions = {}): Promise<string> {
    const [system, review] = await Promise.all([
        loadPrompt(DEFAULT_SYSTEM_PROMPT_PATH, options.systemPromptPath, options.s3),
        loadPrompt(DEFAULT_CODE_REVIEW_PROMPT_PATH, options.codeReviewPromptPath, options.s3),
    ]);
    return `${system}\n\n${review}\n\n${OUTPUT_FORMAT}`;
}

export interface FilePromptInput {
    mrTitle?: string;
    mrDescription?: string;
    path: string;
    oldPath?: string;
    newFile?: boolean;
    renamed?: boolean;
    fileContent?: string;
    hunks: Hunk[];
    part?: {index: number; total: number};
}

const MAX_DESCRIPTION_CHARS = 2000;

export function buildUserPrompt(input: FilePromptInput): string {
    const parts: string[] = [];
    if (input.mrTitle) {
        parts.push(`Merge request: ${input.mrTitle}`);
    }
    const description = input.mrDescription?.trim();
    if (description) {
        const clipped = description.length > MAX_DESCRIPTION_CHARS
            ? `${description.slice(0, MAX_DESCRIPTION_CHARS)}\n[description truncated]`
            : description;
        parts.push(`Merge request description:\n${clipped}`);
    }

    let fileLine = `File: ${input.path}`;
    if (input.newFile) fileLine += ' (new file)';
    if (input.renamed && input.oldPath) fileLine += ` (renamed from ${input.oldPath})`;
    if (input.part && input.part.total > 1) fileLine += ` (part ${input.part.index} of ${input.part.total} of the diff)`;
    parts.push(fileLine);

    if (input.fileContent) {
        parts.push(`Full file after the change, for context only (comment only on lines in the diff):\n<file>\n${input.fileContent}\n</file>`);
    }
    parts.push(`Diff:\n<diff>\n${renderForPrompt(input.hunks)}\n</diff>`);
    return parts.join('\n\n');
}
