---
description: All command line options for ai-code-review-gitlab-plugin.
---

# CLI options

Precedence: **CLI flag → environment variable → [config file](config-file.md) → default.**

| Option | Env fallback | Default | Description |
|---|---|---|---|
| `-g, --gitlab-api-url` | `CI_API_V4_URL` | `https://gitlab.com/api/v4` | GitLab API base URL |
| `-t, --gitlab-access-token` | `CODE_REVIEW_GITLAB_TOKEN`, `GITLAB_TOKEN` | – | Token with `api` scope (**required**) |
| `-p, --project-id` | `CI_MERGE_REQUEST_PROJECT_ID`, `CI_PROJECT_ID` | – | Project ID (**required**) |
| `-m, --merge-request-id` | `CI_MERGE_REQUEST_IID` | – | Merge request IID (**required**) |
| `-a, --ai-provider` | `AI_PROVIDER` | `gemini` | `gemini`, `bedrock`, `anthropic`, `openai` |
| `-k, --api-key` | provider-specific, see [env vars](env-vars.md) | – | API key / AWS access key ID |
| `-s, --api-secret` | `AWS_SECRET_ACCESS_KEY` | – | AWS secret key (Bedrock only) |
| `-u, --api-url` | `AI_API_URL` + provider-specific | provider default | Base URL of the AI API |
| `-r, --region` | `AWS_REGION` | `us-east-1` | AWS region (Bedrock) |
| `-c, --custom-model` | `AI_MODEL` + provider-specific | provider default | Model ID |
| `-sp, --system-prompt-path` | `SYSTEM_PROMPT_PATH` | built-in | Local path or `s3://bucket/key` |
| `-crp, --code-review-prompt-path` | `CODE_REVIEW_PROMPT_PATH` | built-in | Local path or `s3://bucket/key` |
| `--s3-region` | `S3_REGION` | `AWS_REGION` | Region for S3 prompt files |
| `--s3-access-key` | `S3_ACCESS_KEY` | – | Credentials for S3 prompt files |
| `--s3-secret-key` | `S3_SECRET_KEY` | – | Credentials for S3 prompt files |
| `--no-attribution` | `AI_REVIEW_ATTRIBUTION=false` | attribution on | Remove the small "Reviewed by" footer from the summary note |

## Review behaviour

These can also be set in [`.ai-review.yml`](config-file.md).

| Option | Env fallback | Default | Description |
|---|---|---|---|
| `--config` | `AI_REVIEW_CONFIG` | `.ai-review.yml` if present | Repository config file |
| `--include` | `AI_REVIEW_INCLUDE` | everything | Comma-separated globs; only matching files are reviewed |
| `--exclude` | `AI_REVIEW_EXCLUDE` | – | Comma-separated globs to skip, on top of the built-in excludes |
| `--no-default-excludes` | `AI_REVIEW_DEFAULT_EXCLUDES=false` | excludes on | Also review lockfiles, vendored, minified and generated files |
| `--min-severity` | `AI_REVIEW_MIN_SEVERITY` | `minor` | Lowest severity to post: `minor`, `major`, `critical` |
| `--fail-on` | `AI_REVIEW_FAIL_ON` | `none` | Exit with code 1 when a finding is at or above this severity |
| `--max-files` | `AI_REVIEW_MAX_FILES` | `50` | Review at most this many files per run (`0` = no limit) |
| `--max-file-diff-lines` | `AI_REVIEW_MAX_FILE_DIFF_LINES` | `1500` | Skip files with more changed lines than this |
| `--file-context-chars` | `AI_REVIEW_FILE_CONTEXT_CHARS` | `30000` | Send the full file as context when it is at most this many characters (`0` = never) |
| `--concurrency` | `AI_REVIEW_CONCURRENCY` | `2` | Files reviewed in parallel |
| `--timeout` | `AI_REVIEW_TIMEOUT` | `120` | Seconds before an AI request times out |
| `--dry-run` | `AI_REVIEW_DRY_RUN=true` | off | Print comments and the summary instead of posting them |
| `--no-incremental` | `AI_REVIEW_INCREMENTAL=false` | incremental on | Review every file on every run |

### How repeat runs behave

The summary note records the last fully reviewed commit. On the next pipeline the tool:

1. Does nothing if that commit is the current head (for example, a retried job).
2. Otherwise reviews only files changed since that commit. After a force push it reviews every file.
3. Never posts a second comment on a line that already has one from the tool.
4. Updates the same summary note instead of adding a new one.

If any file fails to review, the checkpoint is not moved forward, so the next run tries again.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Review finished |
| `1` | Invalid configuration, GitLab unreachable, a file could not be reviewed or a comment could not be posted, or a finding reached `--fail-on` |

If required settings are missing, the CLI lists **all** of them at once and exits with code 1.
