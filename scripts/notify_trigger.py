
#!/usr/bin/env python3
import argparse, sys, os, re, time

# Try shared helpers; otherwise use local fallbacks.
try:
    from common import (  # type: ignore
        boto_clients, resolve_env_name, resolve_app, ssm_get_str, wait_ssm_command
    )
except Exception:
    import boto3

    def _slugify(s: str) -> str:
        return re.sub(r'[^a-z0-9\-]+', '-', (s or '').strip().lower()).strip('-') or 'app'

    def boto_clients():
        region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
        return boto3.client("ssm", region_name=region)

    def resolve_env_name(val: str) -> str:
        if val and val != "auto":
            return val
        env = os.environ.get("ENVIRONMENT")
        if env:
            return env
        ref = os.environ.get("GITHUB_REF_NAME", "")
        return "prod" if ref == "main" else "develop"

    def resolve_app(val: str) -> str:
        if val and val != "auto":
            return _slugify(val)
        raw = os.environ.get("APP_RAW") or os.environ.get("APP") or os.environ.get("GITHUB_REPOSITORY", "").split("/")[-1]
        return _slugify(raw or "app")

    def ssm_get_str(ssm, name: str) -> str:
        try:
            resp = ssm.get_parameter(Name=name, WithDecryption=True)
            return (resp.get("Parameter") or {}).get("Value") or ""
        except Exception:
            return ""

    def wait_ssm_command(ssm, command_id: str, instance_id: str, timeout: int = 180, poll: int = 3) -> str:
        deadline = time.time() + timeout
        last = "Unknown"
        while time.time() < deadline:
            try:
                out = ssm.get_command_invocation(CommandId=command_id, InstanceId=instance_id)
                status = out.get("Status") or last
                last = status
                if status in ("Success", "Cancelled", "TimedOut", "Failed"):
                    return status
            except Exception:
                pass
            time.sleep(poll)
        return last

def main():
    ap = argparse.ArgumentParser(description="Trigger notify (Slack + Email) via SSM docs")
    ap.add_argument("--env", default="auto")
    ap.add_argument("--app", default="auto")
    ap.add_argument("--status", choices=["success", "failure"], required=True)
    ap.add_argument("--message", default="")
    ap.add_argument("--subject", default="")
    ap.add_argument("--timeout", type=int, default=180)
    args = ap.parse_args()

    env = resolve_env_name(args.env)
    app = resolve_app(args.app)
    ssm = boto_clients()  # <-- FIXED: was ssm_client()

    # Discover doc names + instance
    slack_doc = ssm_get_str(ssm, f"/infra/{env}/ci/notify_slack_doc")
    email_doc = ssm_get_str(ssm, f"/infra/{env}/ci/notify_email_doc")
    ec2_id    = ssm_get_str(ssm, f"/infra/{env}/ci/ec2_instance_id")

    print(f"[notify_trigger] env={env} app={app}")
    print(f"[notify_trigger] doc_slack={slack_doc or 'MISSING'} doc_email={email_doc or 'MISSING'} ec2_id={ec2_id or 'MISSING'}")

    if not ec2_id:
        print(f"::error::Missing /infra/{env}/ci/ec2_instance_id", file=sys.stderr)
        return 2

    msg  = args.message or (f"Deploy {args.status.upper()} for {app}")
    subj = args.subject or f"[{env}] {app}: {args.status.upper()}"

    def trigger(doc: str | None, params: dict, label: str) -> str:
        if not doc:
            print(f"[notify_trigger] {label}: Skipped (no document)")
            return "Skipped"
        try:
            resp = ssm.send_command(
                DocumentName=doc,
                InstanceIds=[ec2_id],
                Parameters=params,           # dict[str, list[str]]
                Comment=f"notify {args.status} {app} ({env})",
                DocumentVersion="$LATEST",
            )
            cmd = resp["Command"]["CommandId"]
            print(f"[notify_trigger] {label}: sent CommandId={cmd}")
            status = wait_ssm_command(ssm, cmd, ec2_id, timeout=args.timeout, poll=3)
            print(f"[notify_trigger] {label}: Status={status}")
            return status
        except Exception as e:
            print(f"[notify_trigger] {label}: ERROR {e}", file=sys.stderr)
            return "Error"

    s_status = trigger(slack_doc, {"App":[app], "EnvName":[env], "Message":[msg]}, "slack")
    e_status = trigger(email_doc, {"App":[app], "EnvName":[env], "Subject":[subj], "Body":[msg]}, "email")

    print(f"notify: slack={s_status} email={e_status}")
    # Don't fail pipeline due to notify; just report.
    return 0

if __name__ == "__main__":
    sys.exit(main())
