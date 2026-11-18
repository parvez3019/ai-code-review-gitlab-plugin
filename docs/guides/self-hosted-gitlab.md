---
description: Run AI code review on a self-managed GitLab instance.
---

# Self-managed GitLab

Everything works on self-managed GitLab:

- In CI, the API URL is taken from `CI_API_V4_URL`, so no configuration is needed.
- Outside CI, pass `--gitlab-api-url https://gitlab.your-company.com/api/v4`.
- For the CI/CD component, mirror this project into your instance or copy `templates/ai-code-review.yml` (see [CI/CD Catalog](../getting-started/ci-catalog.md#self-managed-gitlab)).
- For air-gapped environments, pair it with [Ollama or another self-hosted model](../providers/openai-compatible.md) and the [Docker image](../getting-started/docker.md) mirrored into your registry.
