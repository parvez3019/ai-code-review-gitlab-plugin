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

- The model may have answered `204` for every hunk. Look for "No Feedback Summary" on the MR.
- Renamed, deleted and binary files are skipped.
- Check the job log for `Failed to review <file>` lines.

## AWS Bedrock

- **"The provided model identifier is invalid" / "on-demand throughput isn't supported"**: use an inference profile ID (`us.anthropic.…`). See [Bedrock](providers/bedrock.md#choosing-a-model-id).
- **AccessDeniedException**: enable model access in the Bedrock console and check the [IAM policy](providers/bedrock.md#iam-permissions).
- **Throttling**: the client retries 429/5xx with exponential backoff. For large MRs, request a quota increase or use a smaller model.

## Gemini

- **404 model not found**: older models (for example `gemini-1.5-*`) have been retired. Set `GEMINI_MODEL` to a current stable model.
- **400 API key not valid**: create a new key in Google AI Studio.

## Rate limits (any provider)

On HTTP 429 the tool waits 60 seconds and re-queues the hunk, so very large MRs can take a while. Consider `when: manual` for huge MRs.
