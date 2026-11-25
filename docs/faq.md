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
Yes. Raise `--min-severity` to `major` (or `critical`) to post only important findings, and tighten the [custom prompt](configuration/custom-prompts.md).

**Will it comment again on every push?**
No. The tool remembers the last reviewed commit in its summary note, reviews only files changed since then, and never posts a second comment on a line it has already commented on.

**Can it block merges?**
Yes. Set `--fail-on major` (or `AI_REVIEW_FAIL_ON`) and `allow_failure: false` on the job.

**Can I remove the "Reviewed by" footer?**
Yes. Use `--no-attribution` or `AI_REVIEW_ATTRIBUTION=false`. It only appears on the summary note.
