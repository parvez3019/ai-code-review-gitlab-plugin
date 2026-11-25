import axios, {AxiosInstance} from 'axios';
import {LinePosition} from './diff';
import {isRateLimit, statusOf, withRetry} from './retry';

export interface IGitLabConfig {
    gitlabApiUrl: string;
    gitlabAccessToken: string;
    projectId: string;
    mergeRequestId: string;
    timeoutMs?: number;
}

export interface DiffRefs {
    base_sha: string;
    head_sha: string;
    start_sha: string;
}

export interface MergeRequestInfo {
    title?: string;
    description?: string;
    source_branch?: string;
    diff_refs: DiffRefs;
}

export interface FileDiff {
    old_path: string;
    new_path: string;
    diff: string;
    new_file?: boolean;
    renamed_file?: boolean;
    deleted_file?: boolean;
    too_large?: boolean;
    collapsed?: boolean;
}

export interface Note {
    id: number;
    body: string;
    system?: boolean;
}

export interface Discussion {
    id: string;
    notes: Note[];
}

const PER_PAGE = 100;
const MAX_PAGES = 50;

export class GitLab {
    private apiClient: AxiosInstance;
    private mrPath: string;
    private projectPath: string;

    constructor({gitlabApiUrl, gitlabAccessToken, projectId, mergeRequestId, timeoutMs}: IGitLabConfig) {
        this.projectPath = `/projects/${encodeURIComponent(projectId)}`;
        this.mrPath = `${this.projectPath}/merge_requests/${encodeURIComponent(mergeRequestId)}`;
        this.apiClient = axios.create({
            baseURL: gitlabApiUrl,
            headers: {'Private-Token': gitlabAccessToken},
            timeout: timeoutMs ?? 30_000,
        });
    }

    /** GET every page of a paginated list endpoint. */
    private async getAllPages<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
        const items: T[] = [];
        let page: string | number = 1;
        for (let i = 0; i < MAX_PAGES && page; i++) {
            const response = await withRetry(`GitLab GET ${path}`, () =>
                this.apiClient.get<T[]>(path, {params: {...params, page, per_page: PER_PAGE}}));
            const data = response.data || [];
            items.push(...data);
            const next = response.headers?.['x-next-page'];
            page = next ? Number(next) : data.length === PER_PAGE && next === undefined ? (page as number) + 1 : 0;
        }
        return items;
    }

    async getMergeRequest(): Promise<MergeRequestInfo> {
        const response = await withRetry('GitLab GET merge request', () => this.apiClient.get<MergeRequestInfo>(this.mrPath));
        return response.data;
    }

    /** All file diffs of the MR. Uses the paginated /diffs endpoint, or /changes on GitLab < 15.7. */
    async getDiffs(): Promise<FileDiff[]> {
        try {
            return await this.getAllPages<FileDiff>(`${this.mrPath}/diffs`);
        } catch (error) {
            if (statusOf(error) !== 404) throw error;
            const response = await withRetry('GitLab GET changes', () =>
                this.apiClient.get<{changes: FileDiff[]}>(`${this.mrPath}/changes`, {params: {access_raw_diffs: true}}));
            return response.data?.changes || [];
        }
    }

    /** Raw file content at a commit, or undefined if it cannot be read. */
    async getFileRaw(filePath: string, ref: string): Promise<string | undefined> {
        try {
            const response = await withRetry('GitLab GET file', () =>
                this.apiClient.get<string>(`${this.projectPath}/repository/files/${encodeURIComponent(filePath)}/raw`, {
                    params: {ref},
                    responseType: 'text',
                    transformResponse: (data) => data,
                }));
            return typeof response.data === 'string' ? response.data : undefined;
        } catch {
            return undefined;
        }
    }

    /** Paths changed between two commits, or undefined if the comparison is not possible (e.g. force push). */
    async getChangedPaths(from: string, to: string): Promise<Set<string> | undefined> {
        try {
            const response = await withRetry('GitLab GET compare', () =>
                this.apiClient.get<{diffs?: Array<{old_path: string; new_path: string}>}>(`${this.projectPath}/repository/compare`, {
                    params: {from, to, straight: true},
                }));
            const paths = new Set<string>();
            for (const d of response.data?.diffs || []) {
                paths.add(d.old_path);
                paths.add(d.new_path);
            }
            return paths;
        } catch {
            return undefined;
        }
    }

    async listDiscussions(): Promise<Discussion[]> {
        return this.getAllPages<Discussion>(`${this.mrPath}/discussions`);
    }

    async createDiscussion(body: string, position: LinePosition & {old_path: string; new_path: string}, diffRefs: DiffRefs) {
        // Only retry rate limits: a 5xx after the comment was stored would create a duplicate.
        return withRetry('GitLab POST discussion', () =>
            this.apiClient.post(`${this.mrPath}/discussions`, {
                body,
                position: {position_type: 'text', ...diffRefs, ...position},
            }), isRateLimit);
    }

    async createNote(body: string) {
        return withRetry('GitLab POST note', () => this.apiClient.post(`${this.mrPath}/notes`, {body}), isRateLimit);
    }

    async updateNote(noteId: number, body: string) {
        return withRetry('GitLab PUT note', () => this.apiClient.put(`${this.mrPath}/notes/${noteId}`, {body}));
    }
}
