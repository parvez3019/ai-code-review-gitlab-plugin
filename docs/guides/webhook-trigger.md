---
description: Automatically trigger AI code review when you are added as a reviewer on a GitLab merge request, using a webhook.
---

# Trigger on reviewer assignment (webhook)

Run the review only when a specific user (for example a bot account) is added as a reviewer.

1. In your GitLab project go to **Settings → Webhooks** and add a webhook:
    - **URL**: your handler endpoint (for example an AWS Lambda function URL)
    - **Trigger**: *Merge request events*
    - **Secret token**: a random string your handler verifies
2. Configure the review job with `when: manual` or a variable-gated rule, so that it only runs when the handler triggers it.
3. Deploy a handler like this one:

```javascript
exports.handler = async (event) => {
  if (event.headers['x-gitlab-token'] !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401 };
  }
  const payload = JSON.parse(event.body);
  if (payload.object_kind !== 'merge_request') return { statusCode: 200 };

  const botUserId = Number(process.env.REVIEW_BOT_USER_ID);
  const reviewers = payload.changes?.reviewers?.current || [];
  if (!reviewers.some((r) => r.id === botUserId)) return { statusCode: 200 };

  // Start a new merge request pipeline
  await fetch(
    `https://gitlab.com/api/v4/projects/${payload.project.id}` +
    `/merge_requests/${payload.object_attributes.iid}/pipelines`,
    { method: 'POST', headers: { 'PRIVATE-TOKEN': process.env.GITLAB_TOKEN } },
  );
  return { statusCode: 200 };
};
```
