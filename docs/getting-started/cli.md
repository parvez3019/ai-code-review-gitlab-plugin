---
description: Run the AI code review CLI locally against any GitLab merge request.
---

# Command line

```bash
npm i -g @parvez3019/ai-code-review-gitlab-plugin
```

Requires Node.js 20 or newer.

```bash
export CODE_REVIEW_GITLAB_TOKEN=glpat-...
export ANTHROPIC_API_KEY=sk-ant-...

ai-code-review-gitlab-plugin \
  --gitlab-api-url https://gitlab.com/api/v4 \
  --project-id 123 \
  --merge-request-id 45 \
  --ai-provider anthropic
```

Every flag can also be supplied as an environment variable. See [CLI options](../configuration/options.md) and [environment variables](../configuration/env-vars.md).
