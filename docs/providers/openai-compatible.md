---
description: Use OpenAI, Ollama, vLLM, LM Studio, LiteLLM or OpenRouter for GitLab merge request code review.
---

# OpenAI-compatible endpoints & Ollama

The `openai` provider talks to any server that implements the OpenAI **Chat Completions** API (`POST /chat/completions`). That covers OpenAI itself plus self-hosted and gateway options.

| Variable | Flag | Notes |
|---|---|---|
| `AI_PROVIDER=openai` | `-a openai` | |
| `OPENAI_BASE_URL` or `AI_API_URL` | `-u` | Default `https://api.openai.com/v1` |
| `OPENAI_API_KEY` | `-k` | Optional; omitted for servers that don't need auth |
| `OPENAI_MODEL` or `AI_MODEL` | `-c` | **Required** |

## Examples

=== "Ollama (fully local)"

    ```yaml
    ai-code-review:
      image: node:20
      variables:
        AI_PROVIDER: openai
        OPENAI_BASE_URL: http://ollama.internal:11434/v1
        AI_MODEL: qwen2.5-coder:14b
      script:
        - npx -y @parvez3019/ai-code-review-gitlab-plugin
      rules:
        - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    ```

    No code ever leaves your network. The runner just needs to reach the Ollama host.

=== "OpenAI"

    ```yaml
    variables:
      AI_PROVIDER: openai
      AI_MODEL: <model id>
      # OPENAI_API_KEY set as a masked CI/CD variable
    ```

=== "LiteLLM / OpenRouter / vLLM"

    ```yaml
    variables:
      AI_PROVIDER: openai
      OPENAI_BASE_URL: https://your-gateway.example.com/v1
      AI_MODEL: <model id as exposed by the gateway>
    ```

!!! tip
    Smaller local models follow the JSON output format less reliably. When an answer isn't valid JSON, it is posted as one comment on the last changed line of the file. If you get noisy reviews, try a larger model, raise `--min-severity`, or tighten the [prompt](../configuration/custom-prompts.md).
