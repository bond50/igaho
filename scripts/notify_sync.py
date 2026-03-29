#!/usr/bin/env python3
import os, sys, argparse
import boto3

def resolve_env_name(val: str) -> str:
    if val and val != "auto":
        return val
    if os.getenv("ENVIRONMENT"):
        return os.getenv("ENVIRONMENT")
    return "prod" if os.getenv("GITHUB_REF_NAME") == "main" else "develop"

def ssm_client():
    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
    return boto3.client("ssm", region_name=region)

def put_param(ssm, name, value, secure=False):
    if not value:
        return False
    ssm.put_parameter(Name=name, Value=value, Type=("SecureString" if secure else "String"), Overwrite=True)
    return True

def main():
    ap = argparse.ArgumentParser(description="Sync notify secrets to SSM (global or per-app overrides)")
    ap.add_argument("--env", default="auto")
    ap.add_argument("--app", default="auto")
    ap.add_argument("--scope", choices=["global","app"], required=True)
    args = ap.parse_args()

    env = resolve_env_name(args.env)
    ssm = ssm_client()

    if args.scope == "global":
        base = f"/infra/{env}/ci"
        wrote = []
        if put_param(ssm, f"{base}/slack_webhook_url", os.getenv("SLACK_WEBHOOK_URL","").strip(), True): wrote.append("slack_webhook_url")
        if put_param(ssm, f"{base}/resend_api_key",    os.getenv("RESEND_API_KEY","").strip(), True):  wrote.append("resend_api_key")
        if put_param(ssm, f"{base}/notify_from_email", os.getenv("NOTIFY_FROM_EMAIL","").strip(), False): wrote.append("notify_from_email")
        if put_param(ssm, f"{base}/ops_emails",        os.getenv("OPS_EMAILS","").strip(), False):      wrote.append("ops_emails")
        print(f"notify_sync(global): env={env} wrote={wrote or []}")
        return 0

    # per-app
    app  = (args.app if args.app != "auto" else (os.getenv("APP_RAW") or "app")).strip().lower()
    base = f"/infra/{env}/{app}/ci"
    wrote = []
    if put_param(ssm, f"{base}/slack_webhook_url", os.getenv("APP_SLACK_WEBHOOK_URL","").strip(), True): wrote.append("slack_webhook_url")
    if put_param(ssm, f"{base}/resend_api_key",    os.getenv("APP_RESEND_API_KEY","").strip(), True):    wrote.append("resend_api_key")
    if put_param(ssm, f"{base}/notify_from_email", os.getenv("APP_NOTIFY_FROM_EMAIL","").strip(), False): wrote.append("notify_from_email")
    if put_param(ssm, f"{base}/ops_emails",        os.getenv("APP_OPS_EMAILS","").strip(), False):       wrote.append("ops_emails")
    print(f"notify_sync(app:{app}): env={env} wrote={wrote or []}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
