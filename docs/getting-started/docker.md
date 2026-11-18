---
description: Run AI code review for GitLab from a prebuilt Docker image on GHCR.
---

# Docker image

A prebuilt image is published to GitHub Container Registry on every release:

```text
ghcr.io/parvez3019/ai-code-review-gitlab-plugin:latest
ghcr.io/parvez3019/ai-code-review-gitlab-plugin:<version>
```

It is multi-arch (`linux/amd64`, `linux/arm64`) and has no `ENTRYPOINT`, so it works directly as a GitLab CI job image:

```yaml
ai-code-review:
  image: ghcr.io/parvez3019/ai-code-review-gitlab-plugin:latest
  variables:
    AI_PROVIDER: bedrock
  script:
    - ai-code-review-gitlab-plugin
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

## Running locally

```bash
docker run --rm \
  -e CODE_REVIEW_GITLAB_TOKEN -e GEMINI_API_KEY \
  ghcr.io/parvez3019/ai-code-review-gitlab-plugin:latest \
  ai-code-review-gitlab-plugin --project-id 123 --merge-request-id 45
```
