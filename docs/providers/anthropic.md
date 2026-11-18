---
description: Use the Anthropic API (Claude) directly for GitLab merge request code review. No AWS account needed.
---

# Anthropic API

Call Claude directly with an Anthropic API key. No cloud account is needed.

| Variable | Flag | Notes |
|---|---|---|
| `AI_PROVIDER=anthropic` | `-a anthropic` | |
| `ANTHROPIC_API_KEY` | `-k` | |
| `ANTHROPIC_MODEL` or `AI_MODEL` | `-c` | Default `claude-sonnet-5-5` |
| `ANTHROPIC_BASE_URL` or `AI_API_URL` | `-u` | Optional, for proxies or gateways |

See Anthropic's [models overview](https://docs.claude.com/en/docs/about-claude/models/overview) for current model IDs. A faster, cheaper model (for example a Haiku-class model) works well for large merge requests.

```yaml
ai-code-review:
  image: node:20
  variables:
    AI_PROVIDER: anthropic
  script:
    - npx -y @parvez3019/ai-code-review-gitlab-plugin
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```
