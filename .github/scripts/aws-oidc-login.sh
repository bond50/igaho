#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION_INPUT:-us-east-1}"
[ -n "${AWS_ROLE_ARN:-}" ] || { echo "::error::AWS_ROLE_ARN missing"; exit 1; }

OIDC_TOKEN="$(python3 - <<'PY'
import json, os, urllib.parse, urllib.request
url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"] + "&audience=" + urllib.parse.quote("sts.amazonaws.com", safe="")
req = urllib.request.Request(url, headers={"Authorization": f"bearer {os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']}"})
with urllib.request.urlopen(req) as resp:
    print(json.load(resp)["value"])
PY
)"

CREDS_JSON="$(aws sts assume-role-with-web-identity \
  --no-sign-request \
  --role-arn "$AWS_ROLE_ARN" \
  --role-session-name "GitHubActions-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}" \
  --web-identity-token "$OIDC_TOKEN" \
  --duration-seconds 3600 \
  --query 'Credentials' \
  --output json)"

mapfile -t AWS_CREDS < <(AWS_CREDS_JSON="$CREDS_JSON" python3 - <<'PY'
import json, os
creds = json.loads(os.environ["AWS_CREDS_JSON"])
print(creds["AccessKeyId"])
print(creds["SecretAccessKey"])
print(creds["SessionToken"])
PY
)

echo "::add-mask::${AWS_CREDS[0]}"
echo "::add-mask::${AWS_CREDS[1]}"
echo "::add-mask::${AWS_CREDS[2]}"

export AWS_ACCESS_KEY_ID="${AWS_CREDS[0]}"
export AWS_SECRET_ACCESS_KEY="${AWS_CREDS[1]}"
export AWS_SESSION_TOKEN="${AWS_CREDS[2]}"
export AWS_REGION="$REGION"
export AWS_DEFAULT_REGION="$REGION"

{
  echo "AWS_ACCESS_KEY_ID=${AWS_CREDS[0]}"
  echo "AWS_SECRET_ACCESS_KEY=${AWS_CREDS[1]}"
  echo "AWS_SESSION_TOKEN=${AWS_CREDS[2]}"
  echo "AWS_REGION=$REGION"
  echo "AWS_DEFAULT_REGION=$REGION"
} >> "$GITHUB_ENV"

aws sts get-caller-identity >/dev/null
