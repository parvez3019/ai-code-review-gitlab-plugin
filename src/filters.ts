/** File filtering with gitignore-style globs. */

/** Files that are almost never worth an AI review: lockfiles, generated and vendored code. */
export const DEFAULT_EXCLUDES = [
    'package-lock.json',
    'npm-shrinkwrap.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb',
    '*.lock',
    'go.sum',
    '*.min.js',
    '*.min.css',
    '*.map',
    '*.snap',
    '*.svg',
    '*.pb.go',
    '*_pb2.py',
    '*.generated.*',
    '**/vendor/**',
    '**/node_modules/**',
    '**/dist/**',
];

/**
 * Convert a glob to a RegExp. Supports `**`, `*`, `?`. A pattern without a `/`
 * matches the file name in any directory, like .gitignore.
 */
export function globToRegExp(glob: string): RegExp {
    let pattern = glob.trim().replace(/^\.\//, '');
    const anyDir = !pattern.includes('/');
    if (pattern.startsWith('/')) pattern = pattern.slice(1);
    let re = '';
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === '*') {
            if (pattern[i + 1] === '*') {
                if (pattern[i + 2] === '/') {
                    re += '(?:.*/)?';
                    i += 2;
                } else {
                    re += '.*';
                    i += 1;
                }
            } else {
                re += '[^/]*';
            }
        } else if (c === '?') {
            re += '[^/]';
        } else {
            re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`^${anyDir ? '(?:.*/)?' : ''}${re}$`);
}

export interface PathFilter {
    include: string[];
    exclude: string[];
}

export function createPathFilter({include, exclude}: PathFilter): (path: string) => boolean {
    const inc = include.map(globToRegExp);
    const exc = exclude.map(globToRegExp);
    return (path: string) => (inc.length === 0 || inc.some((r) => r.test(path))) && !exc.some((r) => r.test(path));
}
