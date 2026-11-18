---
description: Use Claude on AWS Bedrock for GitLab merge request code review. Keeps code inside your AWS account.
---

# AWS Bedrock (Claude)

Bedrock keeps every request inside your AWS account and region, which is often the easiest provider to get approved by security teams.

## Configuration

| Variable | Flag | Notes |
|---|---|---|
| `AI_PROVIDER=bedrock` | `-a bedrock` | |
| `AWS_ACCESS_KEY_ID` | `-k` | |
| `AWS_SECRET_ACCESS_KEY` | `-s` | |
| `AWS_REGION` | `-r` | Default `us-east-1` |
| `AWS_BEDROCK_MODEL` or `AI_MODEL` | `-c` | Default `us.anthropic.claude-sonnet-5` |

## Choosing a model ID

Newer Claude models on Bedrock must be invoked through a **cross-region inference profile**. That is the model ID with a geography prefix such as `us.`, `eu.`, `apac.` or `global.`, not the bare `anthropic.…` ID. To list the profiles available to your account:

```bash
aws bedrock list-inference-profiles --region us-east-1 \
  --query "inferenceProfileSummaries[?contains(inferenceProfileId, 'claude')].inferenceProfileId"
```

Make sure model access is enabled for that model in the Bedrock console.

## IAM permissions

The access key needs `bedrock:InvokeModel` on the inference profile and on the underlying foundation models it routes to:

```json
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeModel",
  "Resource": [
    "arn:aws:bedrock:*:*:inference-profile/*",
    "arn:aws:bedrock:*::foundation-model/anthropic.*"
  ]
}
```

## Example job

```yaml
ai-code-review:
  image: node:20
  variables:
    AI_PROVIDER: bedrock
    AWS_REGION: us-east-1
  script:
    - npx -y @parvez3019/ai-code-review-gitlab-plugin
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```
