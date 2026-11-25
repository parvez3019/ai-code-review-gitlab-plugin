---
description: Add AI code review to GitLab CI with a single include line, using the reusable CI template with inputs.
---

# Reusable CI template (one-line include)

The repository ships a reusable GitLab CI template with [inputs](https://docs.gitlab.com/ci/inputs/), `templates/ai-code-review.yml`. Include it straight from GitHub and pin a release tag:

```yaml
include:
  - remote: https://raw.githubusercontent.com/parvez3019/ai-code-review-gitlab-plugin/0.1.0/templates/ai-code-review.yml
    inputs:
      provider: anthropic
```

This adds an `ai-code-review` job that runs in merge request pipelines and uses the prebuilt [Docker image](docker.md). Credentials still come from your CI/CD variables (see [GitLab CI setup](gitlab-ci.md#2-add-provider-credentials)).

!!! tip "Pin a tag"
    Always include a release tag (for example `0.1.0`), not `main`, so the job only changes when you choose to upgrade.

## Inputs

| Input | Default | Description |
|---|---|---|
| `stage` | `test` | Stage the job runs in |
| `provider` | `gemini` | `gemini`, `bedrock`, `anthropic` or `openai` |
| `model` | *(provider default)* | Model ID override |
| `image` | `ghcr.io/parvez3019/ai-code-review-gitlab-plugin:<release>` | Image that contains the CLI, pinned to the same release as the template |
| `allow_failure` | `true` | Don't block the pipeline if the review fails |
| `min_severity` | `minor` | Lowest severity posted as a comment: `minor`, `major`, `critical` |
| `fail_on` | `none` | Fail the job on a finding at or above this severity |
| `when` | `on_success` | `on_success` (every MR pipeline) or `manual` |

## Overriding the job

Anything not covered by inputs can be overridden by redefining keys on the `ai-code-review` job after the include:

```yaml
ai-code-review:
  tags: [docker]
  variables:
    SYSTEM_PROMPT_PATH: .gitlab/ai-review/system_prompt.txt
```

## Runners without internet access

If your runners can't reach `raw.githubusercontent.com`, copy [`templates/ai-code-review.yml`](https://github.com/parvez3019/ai-code-review-gitlab-plugin/blob/main/templates/ai-code-review.yml) into your repository and use `include: local` with the same `inputs`.
