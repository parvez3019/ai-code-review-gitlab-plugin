---
description: Use Google Gemini for GitLab merge request code review.
---

# Google Gemini

| Variable | Flag | Notes |
|---|---|---|
| `AI_PROVIDER=gemini` | `-a gemini` | Default provider |
| `GEMINI_API_KEY` | `-k` | Create one in [Google AI Studio](https://aistudio.google.com/) |
| `GEMINI_MODEL` or `AI_MODEL` | `-c` | Default `gemini-3.5-flash` |
| `GEMINI_API_URL` or `AI_API_URL` | `-u` | Default `https://generativelanguage.googleapis.com` |

Use a stable model name without a `-preview` or `-latest` suffix in CI, so reviews don't change behaviour unexpectedly. The current list is on Google's [Gemini models page](https://ai.google.dev/gemini-api/docs/models).
