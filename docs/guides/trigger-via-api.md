---
description: Trigger an AI code review merge request pipeline using the GitLab API.
---

# Trigger via the GitLab API

Create a new merge request pipeline, which runs the review job:

```bash
curl --request POST \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "https://gitlab.com/api/v4/projects/$PROJECT_ID/merge_requests/$MR_IID/pipelines"
```

You can call this from chat-ops bots, scheduled jobs, or other automation.
