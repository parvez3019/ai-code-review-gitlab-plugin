# Changelog

## Unreleased

### Added
- `--dry-run` (or `AI_REVIEW_DRY_RUN=true`) prints review comments to stdout instead of posting them to the merge request.

## 0.1.0

### Added
- **Zero-flag GitLab CI setup**: project ID, MR IID and API URL are read from `CI_MERGE_REQUEST_PROJECT_ID`, `CI_MERGE_REQUEST_IID` and `CI_API_V4_URL`. Every flag also has an environment-variable fallback (see the docs).
- **Anthropic API provider** (`--ai-provider anthropic`).
- **OpenAI-compatible provider** (`--ai-provider openai`) for OpenAI, Ollama, vLLM, LM Studio, LiteLLM and OpenRouter.
- `--api-url` option to point any provider at a custom base URL.
- GitLab **CI/CD Catalog component** (`templates/ai-code-review.yml`).
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
