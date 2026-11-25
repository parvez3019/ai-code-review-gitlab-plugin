---
description: Customise the AI code review prompt for GitLab with your own team standards, from a file or S3.
---

# Custom prompts

Two prompts drive every review:

- **System prompt**: the reviewer's persona and what to look for ([default](https://github.com/parvez3019/ai-code-review-gitlab-plugin/blob/main/src/prompts/system_prompt.txt))
- **Code review prompt**: how to review each file and how to rate severity ([default](https://github.com/parvez3019/ai-code-review-gitlab-plugin/blob/main/src/prompts/code_review_prompt.txt))

Override either with a local path (for example a file committed to the repository under review) or an `s3://bucket/key` URL shared across many projects.

```yaml
ai-code-review:
  variables:
    SYSTEM_PROMPT_PATH: .gitlab/ai-review/system_prompt.txt
    CODE_REVIEW_PROMPT_PATH: s3://my-org-prompts/code_review_prompt.txt
    S3_REGION: eu-west-1
```

The paths can also go in the [repository config file](config-file.md).

If a custom prompt can't be loaded, the job **fails** with an error. It does not silently fall back to the built-in prompt, so a broken checklist never goes unnoticed.

## The output format is added for you

The tool always appends its own output instructions to your prompts: the model must answer with JSON listing a line, a severity (`critical`, `major`, `minor`) and a comment for each finding, with an optional replacement for the line. That is what lets the tool place comments on the exact line, offer one-click GitLab suggestions, and filter by severity.

So your prompts only need to say **what** to review. You don't need to describe the response format, and older prompts that say "reply with 204" keep working: a `204` answer is treated as "no comments".

## Example: team-specific checklist

```text
You are a senior engineer reviewing a Go microservice.
Focus only on: correctness, error handling, context propagation,
SQL injection, missing tests for new exported functions.
Ignore formatting and naming. Keep each comment under 50 words.
Rate anything that can lose data or leak credentials as critical.
```
