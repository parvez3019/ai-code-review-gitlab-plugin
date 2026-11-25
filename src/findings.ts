import {Side} from './diff';

export const SEVERITIES = ['minor', 'major', 'critical'] as const;
export type Severity = typeof SEVERITIES[number];

export const severityRank = (s: Severity): number => SEVERITIES.indexOf(s);

export interface Finding {
    line?: number;
    side?: Side;
    severity: Severity;
    comment: string;
    suggestion?: string;
}

export interface ParsedReview {
    findings: Finding[];
    /** Set when the answer was not the expected JSON; the raw text is kept as one finding. */
    unstructured?: boolean;
}

/** Older custom prompts ask for "204" when there is nothing to say. */
const NO_FEEDBACK = /^[\s`"'*]*204[\s`"'.*]*$/;

function extractJson(text: string): unknown {
    const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        return JSON.parse(unfenced);
    } catch {
        const start = unfenced.indexOf('{');
        const end = unfenced.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return JSON.parse(unfenced.slice(start, end + 1));
        }
        throw new Error('no JSON object found');
    }
}

function normalise(raw: any): Finding | undefined {
    const comment = typeof raw?.comment === 'string' ? raw.comment.trim() : '';
    if (!comment) return undefined;
    const severity = String(raw.severity || '').toLowerCase();
    const line = Number(raw.line);
    const side = raw.side === 'old' ? 'old' : raw.side === 'new' ? 'new' : undefined;
    const suggestion = typeof raw.suggestion === 'string' && raw.suggestion.trim() ? raw.suggestion.replace(/\n+$/, '') : undefined;
    return {
        comment,
        severity: (SEVERITIES as readonly string[]).includes(severity) ? (severity as Severity) : 'minor',
        line: Number.isInteger(line) && line > 0 ? line : undefined,
        side,
        suggestion,
    };
}

/** Parse a model answer into findings, tolerating code fences, prose around the JSON and "204". */
export function parseFindings(text: string): ParsedReview {
    const trimmed = text.trim();
    if (!trimmed || NO_FEEDBACK.test(trimmed)) {
        return {findings: []};
    }
    try {
        const data: any = extractJson(trimmed);
        const list = Array.isArray(data) ? data : data?.comments;
        if (!Array.isArray(list)) throw new Error('missing "comments" array');
        return {findings: list.map(normalise).filter((f): f is Finding => !!f)};
    } catch {
        return {findings: [{severity: 'minor', comment: trimmed}], unstructured: true};
    }
}

const SEVERITY_LABEL: Record<Severity, string> = {
    critical: '🔴 **Critical**',
    major: '🟠 **Major**',
    minor: '🟡 **Minor**',
};

/** Markdown body of an inline comment, with a GitLab suggestion block when there is one. */
export function formatFinding(finding: Finding, options: {allowSuggestion: boolean; note?: string}): string {
    let body = `${SEVERITY_LABEL[finding.severity]}: ${finding.comment}`;
    if (options.note) {
        body += `\n\n_${options.note}_`;
    }
    if (options.allowSuggestion && finding.suggestion && !finding.suggestion.includes('```')) {
        body += `\n\n\`\`\`suggestion:-0+0\n${finding.suggestion}\n\`\`\``;
    }
    return body;
}
