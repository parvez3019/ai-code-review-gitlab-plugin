---
description: Configure AI code review per repository with an .ai-review.yml file.
---

# Repository config file

Put an `.ai-review.yml` file at the root of the repository to configure the review for that project without touching CI variables. It is read from `$CI_PROJECT_DIR` (the checkout of the merge request's source branch), or from the path given with `--config` / `AI_REVIEW_CONFIG`.

Precedence: **CLI flag → environment variable → `.ai-review.yml` → default.**

```yaml
# .ai-review.yml
include:            # only review these paths (default: everything)
  - src/**
  - lib/**
exclude:            # skip these paths, on top of the built-in excludes
  - "**/*.test.ts"
  - migrations/**
default_excludes: true     # skip lockfiles, vendored, minified and generated files
min_severity: major        # post only major and critical findings
fail_on: critical          # exit 1 if any critical finding is found (default: none)
max_files: 50              # review at most 50 files per run (0 = no limit)
max_file_diff_lines: 1500  # skip files with more changed lines than this
file_context_chars: 30000  # send the full file as context when it is this small (0 = never)
concurrency: 2             # files reviewed in parallel
incremental: true          # only review files changed since the last reviewed commit
system_prompt_path: .gitlab/ai-review/system_prompt.txt
code_review_prompt_path: .gitlab/ai-review/code_review_prompt.txt
```

## Globs

Patterns work like `.gitignore`:

- A pattern without `/` matches the file name in any directory: `*.lock`, `package-lock.json`.
- `*` matches within one directory, `**` matches any number of directories: `src/**/*.ts`.
- `exclude` wins over `include`.

The built-in excludes are: `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `*.lock`, `go.sum`, `*.min.js`, `*.min.css`, `*.map`, `*.snap`, `*.svg`, `*.pb.go`, `*_pb2.py`, `*.generated.*`, `**/vendor/**`, `**/node_modules/**`, `**/dist/**`. Turn them off with `default_excludes: false`.

!!! note
    The file comes from the merge request's own branch, so an author can change it in their merge request. Use CI/CD variables for settings that must be enforced, such as `AI_REVIEW_FAIL_ON`.
