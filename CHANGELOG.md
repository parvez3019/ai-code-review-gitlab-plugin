# Changelog

## 0.2.0

### Added
- **Exact-line comments with severity.** The model now answers in JSON (line, severity, comment, optional fix), so each comment is placed on the line it is about instead of the end of the hunk. Fixes are posted as one-click GitLab `suggestion` blocks.
- **No duplicate comments on new pushes.** The summary note records the last reviewed commit. A rerun on the same commit does nothing, a new push reviews only the files that changed, and a line that already has a comment from the tool is not commented on again. The summary note is updated in place.
- **Better context.** Each file is reviewed as a whole (all its hunks in one request), together with the full file content when it is small enough (`--file-context-chars`) and the MR title and description.
- **Noise controls:** `--include` / `--exclude` globs with built-in excludes for lockfiles, vendored, minified and generated files; `--min-severity`; `--max-files`; `--max-file-diff-lines`.
- `--fail-on <severity>` to fail the job (and block merges) on serious findings.
- `--dry-run` prints the comments and the summary instead of posting them.
- `.ai-review.yml` repository config file (`--config`).
- `--concurrency` (default 2) to review files in parallel, and `--timeout` for AI requests.
- Token usage (including cached tokens) is logged at the end of each run.
- Anthropic: the system prompt is cached across files (prompt caching), and server-side refusal fallbacks are enabled on models that support them.
- CI template inputs `min_severity` and `fail_on`.

### Changed
- New default prompts focused on bugs, security and real performance problems: no praise sections, no style nitpicks, no blanket "add unit tests".
- The Anthropic provider uses the official `@anthropic-ai/sdk`.
- A custom prompt that cannot be loaded now fails the job instead of silently using the default prompt.
- The job exits with code 1 when any file could not be reviewed or a comment could not be posted. The summary note lists what failed.
- The CI template's default image is pinned to the release instead of `latest`.
- `typescript` and `@types/*` moved to `devDependencies`, so `npx` installs less.

### Fixed
- **MRs with more than 20 files were only partly reviewed**: the `/diffs` endpoint is paginated and only the first page was read.
- **Bedrock requests failed on current Claude models**, which reject `temperature` and `top_p`. Sampling parameters are no longer sent to any provider.
- **The Gemini API key could leak into CI logs**: it was sent in the URL and failed requests were logged in full. It is now sent in the `x-goog-api-key` header, and errors are logged without URLs or headers. The fake browser `User-Agent` was removed.
- **Rate limits could loop forever and re-bill the model**: retries are now bounded (4 attempts, exponential backoff, `Retry-After` honoured), cover 5xx and network errors, work for every provider, and never repeat the model call when only posting to GitLab failed.
- Hunk headers without a line count (`@@ -5 +5 @@`) put comments one line off.
- `\ No newline at end of file` was treated as a code line and could make GitLab reject the comment.
- Files that were renamed *and* modified were not reviewed.
- Comments that GitLab rejects because of their position are posted as a general MR comment instead of being lost.
- No timeouts on HTTP requests: a stuck provider could hang the job until the CI timeout.

## 0.1.0

### Added
- **Zero-flag GitLab CI setup**: project ID, MR IID and API URL are read from `CI_MERGE_REQUEST_PROJECT_ID`, `CI_MERGE_REQUEST_IID` and `CI_API_V4_URL`. Every flag also has an environment-variable fallback (see the docs).
- **Anthropic API provider** (`--ai-provider anthropic`).
- **OpenAI-compatible provider** (`--ai-provider openai`) for OpenAI, Ollama, vLLM, LM Studio, LiteLLM and OpenRouter.
- `--api-url` option to point any provider at a custom base URL.
- Reusable **GitLab CI template with inputs** (`templates/ai-code-review.yml`), usable with a single `include: remote`.
- **Docker image** published to `ghcr.io/parvez3019/ai-code-review-gitlab-plugin`.
- Small "Reviewed by" footer on the summary note. Disable it with `--no-attribution` or `AI_REVIEW_ATTRIBUTION=false`.
- Documentation site, test suite and CI.

### Changed
- Default Gemini model is now `gemini-3.5-flash` (`gemini-1.5-flash` has been retired).
- Default Bedrock model is now the `us.anthropic.claude-sonnet-5` inference profile.
- Explicit `--custom-model` / `--region` now take precedence over `AWS_BEDROCK_MODEL` / `AWS_REGION`.
- Node.js 20+ is required.
- Missing configuration is reported all at once, with a clear message.
- GitLab connection failures now fail the job instead of continuing silently.

### Fixed
- `package.json` `main` and `description` (npm listing).
- Summary note line numbers no longer print `undefined`.
- Review errors other than 429 are now logged instead of swallowed.

## 0.0.11 and earlier

See the [GitHub releases](https://github.com/parvez3019/ai-code-review-gitlab-plugin/releases).
