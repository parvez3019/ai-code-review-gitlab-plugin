/** Parsing of unified diffs as returned by the GitLab API. */

export type Side = 'new' | 'old';

export interface DiffLine {
    type: '+' | '-' | ' ';
    text: string;
    oldLine?: number;
    newLine?: number;
}

export interface Hunk {
    header: string;
    lines: DiffLine[];
}

/** GitLab discussion position fields for one line. */
export interface LinePosition {
    new_line?: number;
    old_line?: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Split a file diff into hunks with old/new line numbers on every line. */
export function parseHunks(diff: string): Hunk[] {
    const hunks: Hunk[] = [];
    let current: Hunk | undefined;
    let oldLine = 0;
    let newLine = 0;
    let oldEnd = 0;
    let newEnd = 0;

    for (const line of diff.split(/\r?\n/)) {
        const header = HUNK_HEADER.exec(line);
        if (header) {
            // An omitted count means 1 ("@@ -5 +5 @@").
            const oldCount = header[2] === undefined ? 1 : +header[2];
            const newCount = header[4] === undefined ? 1 : +header[4];
            oldLine = +header[1];
            newLine = +header[3];
            // A count of 0 means the start number is the line *before* the change.
            if (oldCount === 0) oldLine++;
            if (newCount === 0) newLine++;
            oldEnd = oldLine + oldCount;
            newEnd = newLine + newCount;
            current = {header: line, lines: []};
            hunks.push(current);
            continue;
        }
        if (!current || line.startsWith('\\')) {
            // Text before the first hunk, or "\ No newline at end of file".
            continue;
        }
        const marker = line[0];
        if (marker === '+') {
            current.lines.push({type: '+', text: line.slice(1), newLine: newLine++});
        } else if (marker === '-') {
            current.lines.push({type: '-', text: line.slice(1), oldLine: oldLine++});
        } else if (marker === ' ' || (line === '' && (oldLine < oldEnd || newLine < newEnd))) {
            // Some tools strip the leading space from empty context lines.
            current.lines.push({type: ' ', text: line.slice(1), oldLine: oldLine++, newLine: newLine++});
        }
    }
    return hunks.filter((hunk) => hunk.lines.some((l) => l.type !== ' '));
}

export function positionOf(line: DiffLine): LinePosition {
    if (line.type === '+') return {new_line: line.newLine};
    if (line.type === '-') return {old_line: line.oldLine};
    return {new_line: line.newLine, old_line: line.oldLine};
}

export function countChangedLines(hunks: Hunk[]): number {
    return hunks.reduce((sum, hunk) => sum + hunk.lines.filter((l) => l.type !== ' ').length, 0);
}

/** The last added line of the hunks (or the last removed line if nothing was added). */
export function defaultAnchor(hunks: Hunk[]): DiffLine | undefined {
    const lines = hunks.flatMap((h) => h.lines);
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].type === '+') return lines[i];
    }
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].type === '-') return lines[i];
    }
    return undefined;
}

/** Find the diff line a model referred to by line number and side. */
export function findLine(hunks: Hunk[], line: number, side?: Side): DiffLine | undefined {
    const lines = hunks.flatMap((h) => h.lines);
    const byNew = lines.find((l) => l.newLine === line && l.type !== '-');
    const byOld = lines.find((l) => l.oldLine === line && l.type === '-');
    if (side === 'old') return byOld ?? byNew;
    return byNew ?? byOld;
}

/**
 * Render hunks for the prompt with a line label on every line, e.g.
 *   new:12 +  const x = 1;
 *   old:7  -  const x = 0;
 */
export function renderForPrompt(hunks: Hunk[]): string {
    const out: string[] = [];
    for (const hunk of hunks) {
        out.push(hunk.header);
        for (const line of hunk.lines) {
            const label = line.type === '-' ? `old:${line.oldLine}` : `new:${line.newLine}`;
            out.push(`${label.padEnd(10)}${line.type} ${line.text}`);
        }
    }
    return out.join('\n');
}

/** Group hunks into chunks of at most `maxLines` lines so huge files are sent in parts. */
export function chunkHunks(hunks: Hunk[], maxLines: number): Hunk[][] {
    const chunks: Hunk[][] = [];
    let current: Hunk[] = [];
    let size = 0;
    for (const hunk of hunks) {
        if (current.length && size + hunk.lines.length > maxLines) {
            chunks.push(current);
            current = [];
            size = 0;
        }
        current.push(hunk);
        size += hunk.lines.length;
    }
    if (current.length) chunks.push(current);
    return chunks;
}
