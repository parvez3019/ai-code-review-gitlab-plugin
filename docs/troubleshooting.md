---
description: Fix common problems with AI code review for GitLab merge requests.
---

# Troubleshooting

## "Missing required configuration"

The CLI lists every missing setting. In CI, make sure the job runs in a **merge request pipeline** (`rules: - if: $CI_PIPELINE_SOURCE == "merge_request_event"`), otherwise `CI_MERGE_REQUEST_IID` is not set.

## "Failed to load merge request from GitLab: 401/403/404"

- The token needs the **`api`** scope and at least *Developer* access on the project.
- Masked **protected** variables are not available on unprotected branches.
- On self-managed GitLab, check `--gitlab-api-url` ends in `/api/v4`.

## No comments appear

- The model may have found nothing significant. The **AI code review** summary note lists the files with no comments.
- Files may have been skipped. The summary note lists files that were excluded by path filters, too large (`--max-file-diff-lines`) or over the file limit (`--max-files`).
- Findings below `--min-severity` are not posted.
- The commit may already have been reviewed: the tool reviews each commit once and only re-reviews files that changed. Use `--no-incremental` to review everything again.
- Deleted files, pure renames and binary files are skipped.
- Check the job log for `Failed to review <file>` lines. Run with `--dry-run` locally to see what the model returns.

## The job fails after posting comments

The job exits with code 1 when a file could not be reviewed or a comment could not be posted (see the summary note), or when `--fail-on` is set and a finding reaches that severity. The reusable CI template uses `allow_failure: true` by default, so this never blocks a merge unless you change it.

## AWS Bedrock

- **"The provided model identifier is invalid" / "on-demand throughput isn't supported"**: use an inference profile ID (`us.anthropic.…`). See [Bedrock](providers/bedrock.md#choosing-a-model-id).
- **AccessDeniedException**: enable model access in the Bedrock console and check the [IAM policy](providers/bedrock.md#iam-permissions).
- **Throttling**: requests are retried with backoff (see below). For large MRs, request a quota increase, lower `--concurrency` or use a smaller model.

## Gemini

- **404 model not found**: older models (for example `gemini-1.5-*`) have been retired. Set `GEMINI_MODEL` to a current stable model.
- **400 API key not valid**: create a new key in Google AI Studio.

## Rate limits (any provider)

Rate limits (429), server errors (5xx) and network errors are retried up to 4 times with exponential backoff, honouring `Retry-After`. If a file still fails, it is listed in the summary note, the job exits with code 1, and the file is reviewed again on the next run. Lower `--concurrency` (default 2) if you hit rate limits often.
