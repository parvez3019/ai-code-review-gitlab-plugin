---
description: Environment variables read by ai-code-review-gitlab-plugin, including GitLab CI predefined variables.
---

# Environment variables

## GitLab (picked up automatically in MR pipelines)

| Variable | Used for |
|---|---|
| `CI_API_V4_URL` | GitLab API URL, so self-managed instances work without config |
| `CI_MERGE_REQUEST_PROJECT_ID` | Project ID |
| `CI_MERGE_REQUEST_IID` | Merge request IID |
| `CODE_REVIEW_GITLAB_TOKEN` / `GITLAB_TOKEN` | Access token (you set this) |

## Provider selection

| Variable | Description |
|---|---|
| `AI_PROVIDER` | `gemini` (default), `bedrock`, `anthropic`, `openai` |
| `AI_MODEL` | Model ID for any provider (overrides provider-specific variables) |
| `AI_API_URL` | Base URL for any provider |

## Provider-specific

| Provider | Variables |
|---|---|
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_API_URL` |
| Bedrock | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BEDROCK_MODEL` |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` |
| OpenAI-compatible | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` |

## Prompts and misc

| Variable | Description |
|---|---|
| `SYSTEM_PROMPT_PATH` | Custom system prompt (file or `s3://`) |
| `CODE_REVIEW_PROMPT_PATH` | Custom review prompt (file or `s3://`) |
| `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Credentials for S3 prompt files |
| `AI_REVIEW_ATTRIBUTION` | Set to `false` to remove the summary footer |
| `AI_REVIEW_MAX_HUNKS` | Maximum number of diff hunks to review (positive integer) |
