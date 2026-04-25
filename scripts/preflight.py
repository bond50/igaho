#!/usr/bin/env python3
import os, sys, json, time, base64, boto3

def _branch_env():
    ref = (os.getenv("GITHUB_REF_NAME") or "").lower()
    if ref == "main": return "prod"
    if ref in ("develop","dev"): return "develop"
    return "develop"

def _app_slug():
    s = os.getenv("APP") or os.getenv("APP_RAW") or os.getenv("GITHUB_REPOSITORY","").split("/")[-1]
    s = (s or "app").lower()
    import re; s = re.sub(r"[^a-z0-9]+","-", s).strip("-")
    return s or "app"

def _write_outputs(**kv):
    out = os.environ.get("GITHUB_OUTPUT")
    if not out: return
    with open(out,"a") as fh:
        for k,v in kv.items():
            fh.write(f"{k}={v}\n")

def _wait_cmd(ssm, cmd_id, instance_id, timeout=120, poll=4):
    t0 = time.time()
    while time.time()-t0 < timeout:
        try:
            r = ssm.get_command_invocation(CommandId=cmd_id, InstanceId=instance_id, PluginName='aws:runShellScript')
            st = r.get("Status","")
            if st in ("Success","Failed","Cancelled","TimedOut"):
                return st, r.get("StandardOutputContent",""), r.get("StandardErrorContent","")
        except Exception:
            pass
        time.sleep(poll)
    return "TimedOut","", ""

def main():
    aws_region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
    ecr_repo_name_in = os.getenv("ECR_REPO_NAME","")
    env_name = _branch_env()
    app = _app_slug()
    ecr_repo = ecr_repo_name_in or f"{app}-app"

    ssm = boto3.client("ssm", region_name=aws_region)
    ecr = boto3.client("ecr", region_name=aws_region)

    # ECR repo exists?
    missing = []
    try:
        ecr.describe_repositories(repositoryNames=[ecr_repo])
        ecr_exists = True
    except Exception:
        ecr_exists = False
        missing.append(f"ECR:{ecr_repo}")

    # SSM params present?
    base = f"/infra/{env_name}/ci"
    needed = [f"{base}/ssm_render_doc", f"{base}/ec2_instance_id"]
    ssm_ready = True
    for p in needed:
        try:
            ssm.get_parameter(Name=p)
        except Exception:
            ssm_ready = False
            missing.append(f"SSM:{p}")

    # EC2 SSM online?
    ec2_ready = False
    ec2_id = ""
    if ssm_ready:
        try:
            ec2_id = ssm.get_parameter(Name=f"{base}/ec2_instance_id")["Parameter"]["Value"]
        except Exception:
            ec2_id = ""
        if ec2_id:
            # Using SSM DescribeInstanceInformation by ID
            ssm_mgmt = boto3.client("ssm", region_name=aws_region)
            info = ssm_mgmt.describe_instance_information(Filters=[{"Key":"InstanceIds","Values":[ec2_id]}]).get("InstanceInformationList",[])
            ping = (info[0]["PingStatus"] if info else "Inactive")
            ec2_ready = (ping == "Online")
            if not ec2_ready:
                missing.append(f"EC2_SSM:{ec2_id}:offline")
        else:
            missing.append("EC2_SSM:no_instance_id_param")

    # DB auth check (strict): refuse if cannot login as app user to app db
    db_auth_ok = False
    if ec2_ready:
        # remote bash (no secrets echoed)
        remote = r'''#!/usr/bin/env bash
set -euo pipefail
APP="${APP}"; ENV="${ENV}"
# Region via IMDS
t=$(curl -sS -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds:21600' || true)
az=$(curl -sS -H "X-aws-ec2-metadata-token: ${t}" http://169.254.169.254/latest/meta-data/placement/availability-zone || true)
REGION="${az::-1}"; : "${REGION:?missing region}"

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"
install_pkg() {
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y >/dev/null 2>&1 || true
    apt-get install -y "$@" >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1; then
    dnf -y install "$@" >/dev/null 2>&1 || true
  fi
}
command -v jq >/dev/null 2>&1 || install_pkg jqcommand -v docker >/dev/null 2>&1 || { echo "docker missing"; exit 90; }

PLA="$(aws ssm get-parameter --region "$REGION" --name "/infra/$ENV/$APP/env/plain" --query 'Parameter.Value' --output text 2>/dev/null || echo '{}')"
SEC="$(aws ssm get-parameter --with-decryption --region "$REGION" --name "/infra/$ENV/$APP/env/secure" --query 'Parameter.Value' --output text 2>/dev/null || echo '{}')"

DB_USER="$(echo "$PLA" | jq -r '.DB_USER // empty')"
DB_NAME="$(echo "$PLA" | jq -r '.DB_NAME // empty')"
DB_PASS="$(echo "$SEC" | jq -r '.DB_PASS // empty')"
[ -n "$DB_USER$DB_NAME$DB_PASS" ] || { echo "missing DB vars"; exit 91; }

docker ps --format '{{.Names}}' | grep -qx postgres || { echo "postgres not running"; exit 92; }

# try login as the app user to the app database
if docker exec -e PGPASSWORD="$DB_PASS" -i postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1" | grep -qx 1; then
  echo "db_auth_ok"
else
  echo "db_auth_fail"
  exit 93
fi
'''
        b64 = base64.b64encode(remote.encode()).decode()
        cmd = f'bash -lc "echo {b64} | base64 -d > /tmp/db_check.sh && chmod +x /tmp/db_check.sh && APP={app} ENV={env_name} /tmp/db_check.sh"'
        resp = ssm.send_command(
            DocumentName="AWS-RunShellScript",
            InstanceIds=[ec2_id],
            Parameters={"commands":[cmd]},
            Comment=f"preflight db auth check for {app} ({env_name})"
        )
        st, so, se = _wait_cmd(ssm, resp["Command"]["CommandId"], ec2_id, timeout=120, poll=4)
        db_auth_ok = (st == "Success" and "db_auth_ok" in (so or ""))

        if not db_auth_ok:
            missing.append("DB_AUTH")

    ready = (ecr_exists and ssm_ready and ec2_ready and db_auth_ok)

    # job outputs
    _write_outputs(
        ready=str(ready).lower(),
        env_name=env_name,
        ecr_repo_name=ecr_repo,
        ec2_id=ec2_id,
        missing=",".join(missing)
    )

    # fail job hard if not ready (strict)
    if not ready:
        print("Preflight not ready. Missing/Issues:", ",".join(missing))
        sys.exit(1)

if __name__ == "__main__":
    main()
