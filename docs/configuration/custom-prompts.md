---
description: Customise the AI code review prompt for GitLab with your own team standards, from a file or S3.
---

# Custom prompts

Two prompts drive every review:

- **System prompt**: the reviewer's persona and standards ([default](https://github.com/parvez3019/ai-code-review-gitlab-plugin/blob/main/src/prompts/system_prompt.txt))
- **Code review prompt**: the task instructions and output format ([default](https://github.com/parvez3019/ai-code-review-gitlab-plugin/blob/main/src/prompts/code_review_prompt.txt))

Override either with a local path (for example a file committed to the repository under review) or an `s3://bucket/key` URL shared across many projects.

```yaml
ai-code-review:
  variables:
    SYSTEM_PROMPT_PATH: .gitlab/ai-review/system_prompt.txt
    CODE_REVIEW_PROMPT_PATH: s3://my-org-prompts/code_review_prompt.txt
    S3_REGION: eu-west-1
```

If a custom prompt can't be loaded, the tool logs a warning and falls back to the built-in prompt.

## The `204` contract

The tool treats a model response of exactly `204` as "no significant feedback". Those hunks are not commented on; they're listed in one summary note instead. **Keep this instruction in your custom prompt**, or every hunk will get a comment.

## Example: team-specific checklist

```text
You are a senior engineer reviewing a Go microservice.
Focus only on: correctness, error handling, context propagation,
SQL injection, missing tests for new exported functions.
Ignore formatting and naming. Keep each comment under 50 words.
When there is nothing significant to say, reply with exactly: 204
```
