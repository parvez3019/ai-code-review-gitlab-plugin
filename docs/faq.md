---
description: Frequently asked questions about AI code review for GitLab merge requests.
---

# FAQ

**Does my code leave my infrastructure?**
Only the diff hunks are sent, and only to the provider you configure. With Bedrock they stay in your AWS account. With Ollama they never leave your network.

**How much does it cost?**
The tool is free. You pay your LLM provider per token. Each hunk is one request containing the hunk plus the prompts (around 1k tokens of prompt).

**Does it review the whole file or only the diff?**
Only the changed hunks, which keeps reviews focused and cheap.

**Can I use it on GitHub?**
No. It's built for GitLab merge requests.

**Can I stop it commenting on trivial things?**
Yes. Tighten the [custom prompt](configuration/custom-prompts.md). Anything the model answers with `204` gets no comment.

**Can I remove the "Reviewed by" footer?**
Yes. Use `--no-attribution` or `AI_REVIEW_ATTRIBUTION=false`. It only appears on the summary note.
