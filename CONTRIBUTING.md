# Contributing

Thanks for helping out! Issues, ideas and pull requests are all welcome.

## Development setup

```bash
git clone https://github.com/parvez3019/ai-code-review-gitlab-plugin.git
cd ai-code-review-gitlab-plugin
npm ci
npm test          # builds with tsc, then runs node:test suites in test/
```

Requires Node.js 20+.

### Project layout

| Path | What |
|---|---|
| `src/index.ts` | CLI entry point and review loop |
| `src/config.ts` | Flag / env-var resolution |
| `src/gitlab.ts` | GitLab API client |
| `src/ai-client.ts` | `AICodeReviewClient` interface |
| `src/{gemini,bedrock,anthropic,openai}.ts` | Provider implementations |
| `src/prompts/` | Default prompts |
| `templates/` | GitLab CI/CD Catalog component |
| `docs/` + `mkdocs.yml` | Documentation site |

### Adding a provider

1. Implement `AICodeReviewClient` in `src/<provider>.ts`. Re-throw HTTP errors so that `error.response.status === 429` triggers the retry.
2. Add it to `PROVIDERS` and the env-var mapping in `src/config.ts`.
3. Wire it in `createAIClient()` in `src/index.ts`.
4. Add a test in `test/providers.test.js` (there's a tiny fake HTTP server helper) and a page under `docs/providers/`.

### Docs

```bash
pip install -r docs/requirements.txt
mkdocs serve      # http://127.0.0.1:8000
```

## Pull requests

- Keep PRs focused. Add or update tests and docs alongside code.
- `npm test` and `mkdocs build --strict` must pass (CI checks both).
- Add a line to `CHANGELOG.md`.

## Good first issues

Look for the [`good first issue`](https://github.com/parvez3019/ai-code-review-gitlab-plugin/labels/good%20first%20issue) label.
