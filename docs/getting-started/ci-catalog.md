---
description: Include the AI code review GitLab CI/CD Catalog component with one include line.
---

# CI/CD Catalog component

The project ships a [GitLab CI/CD component](https://docs.gitlab.com/ci/components/) so you can add AI review with a single `include`.

```yaml
include:
  - component: gitlab.com/parvez3019/ai-code-review-gitlab-plugin/ai-code-review@~latest
    inputs:
      provider: anthropic
```

Credentials still come from your CI/CD variables (see [GitLab CI setup](gitlab-ci.md#2-add-provider-credentials)).

## Inputs

| Input | Default | Description |
|---|---|---|
| `stage` | `test` | Stage the job runs in |
| `provider` | `gemini` | `gemini`, `bedrock`, `anthropic` or `openai` |
| `model` | *(provider default)* | Model ID override |
| `image` | `ghcr.io/parvez3019/ai-code-review-gitlab-plugin:latest` | Image that contains the CLI |
| `allow_failure` | `true` | Don't block the pipeline if the review fails |
| `when` | `on_success` | `on_success` (every MR pipeline) or `manual` |

## Self-managed GitLab

Components on gitlab.com can't be included from a self-managed instance. Either mirror the project into your instance and include it from there, or copy [`templates/ai-code-review.yml`](https://github.com/parvez3019/ai-code-review-gitlab-plugin/blob/main/templates/ai-code-review.yml) into your own repository and use `include: local`.
