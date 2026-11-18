---
description: All command line options for ai-code-review-gitlab-plugin.
---

# CLI options

Precedence: **CLI flag → environment variable → default.**

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
| `--max-hunks <n>` | `AI_REVIEW_MAX_HUNKS` | unlimited | Review at most *n* diff hunks (each hunk is one LLM call); the rest are skipped and a note says how many |

If required settings are missing, the CLI lists **all** of them at once and exits with code 1.
