---
description: Add AI code review to any GitLab CI pipeline with a 6-line job using npx.
---

# GitLab CI (npm)

The simplest setup: run the CLI from npm in any Node 20+ image.

## 1. Create a GitLab token

The tool posts discussions on merge requests, so it needs a token with the **`api` scope**. A [project access token](https://docs.gitlab.com/user/project/settings/project_access_tokens/) with the *Developer* role is recommended. The comments then appear under a bot user rather than your personal account.

Add it under **Settings → CI/CD → Variables** as `CODE_REVIEW_GITLAB_TOKEN` (masked, and protected if you only review protected branches).

## 2. Add provider credentials

| Provider | CI/CD variables |
|---|---|
| Gemini | `GEMINI_API_KEY` |
| Anthropic API | `ANTHROPIC_API_KEY` |
| AWS Bedrock | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |
| OpenAI-compatible | `OPENAI_API_KEY` (optional for Ollama), `OPENAI_BASE_URL`, `AI_MODEL` |

## 3. Add the job

```yaml
ai-code-review:
  stage: test
  image: node:20
  variables:
    AI_PROVIDER: anthropic
  script:
    - npx -y @parvez3019/ai-code-review-gitlab-plugin
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  allow_failure: true
```

!!! note "Why `merge_request_event`?"
    `CI_MERGE_REQUEST_IID` and `CI_MERGE_REQUEST_PROJECT_ID` are only set in
    [merge request pipelines](https://docs.gitlab.com/ci/pipelines/merge_request_pipelines/).
    In a branch pipeline you must pass `--project-id` and `--merge-request-id` explicitly.

### Run only on demand

Change the rule to `when: manual` to add a ▶ button on the MR pipeline instead of reviewing every push:

```yaml
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      when: manual
```

### Pin a version

`npx -y @parvez3019/ai-code-review-gitlab-plugin@0.1.0` keeps upgrades under your control.
