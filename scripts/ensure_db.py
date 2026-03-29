#!/usr/bin/env python3
import argparse
import base64
import shlex
import sys
import time

import boto3


# ---- tiny helpers (local + SSM) ---------------------------------------------
def resolve_env_name(arg_env: str) -> str:
    if arg_env and arg_env != "auto":
        return arg_env
    # Auto from branch (default develop; main -> prod)
    ref = (os.getenv("GITHUB_REF_NAME") or "").lower()
    if ref == "main":
        return "prod"
    if ref in ("develop", "dev"):
        return "develop"
    return "develop"


def resolve_app(arg_app: str) -> str:
    import re, os
    if arg_app and arg_app != "auto":
        s = arg_app
    else:
        s = (os.getenv("APP_RAW") or os.getenv("GITHUB_REPOSITORY", "").split("/")[-1] or "app")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "app"


def ssm_get_str(ssm, name: str) -> str:
    try:
        r = ssm.get_parameter(Name=name, WithDecryption=True)
        return r["Parameter"]["Value"]
    except ssm.exceptions.ParameterNotFound:
        return ""
    except Exception:
        return ""


def wait_ssm_command(ssm, command_id: str, instance_id: str, timeout=600, poll=5):
    t0 = time.time()
    status = "Pending"
    while time.time() - t0 < timeout:
        try:
            out = ssm.get_command_invocation(CommandId=command_id, InstanceId=instance_id,
                                             PluginName="aws:runShellScript")
            status = out.get("Status") or status
            if status in ("Success", "Failed", "Cancelled", "TimedOut"):
                return status
        except Exception:
            pass
        time.sleep(poll)
    return status


# ---- remote bash (kept as bash, because instance needs docker/psql/cli) -----
REMOTE_BASH = r'''#!/usr/bin/env bash
set -euo pipefail

APP="${APP}"
ENV="${ENV_NAME}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-false}"

log(){ echo "ensure_db: $*"; }

# Region via IMDS
t=$(curl -sS -X PUT 'http://169.254.169.254/latest/api/token' -H 'X-aws-ec2-metadata-token-ttl-seconds:21600' || true)
az=$(curl -sS -H "X-aws-ec2-metadata-token: ${t}" http://169.254.169.254/latest/meta-data/placement/availability-zone || true)
REGION="${az::-1}"; : "${REGION:?missing region}"

command -v jq     >/dev/null 2>&1 || dnf -y install jq awscli >/dev/null 2>&1 || true
command -v docker >/dev/null 2>&1 || { echo "docker missing"; exit 1; }

# Load app env (do not echo secrets)
PLA="$(aws ssm get-parameter --region "$REGION" --name "/infra/$ENV/$APP/env/plain"  --query 'Parameter.Value' --output text 2>/dev/null || echo '{}')"
SEC="$(aws ssm get-parameter --with-decryption --region "$REGION" --name "/infra/$ENV/$APP/env/secure" --query 'Parameter.Value' --output text 2>/dev/null || echo '{}')"

DB_USER="$(echo "$PLA" | jq -r '.DB_USER // empty')"
DB_NAME="$(echo "$PLA" | jq -r '.DB_NAME // empty')"
DB_PASS="$(echo "$SEC" | jq -r '.DB_PASS // empty')"
[ -n "$DB_USER$DB_NAME$DB_PASS" ] || { log "Missing DB_USER/DB_NAME/DB_PASS"; exit 2; }
log "will ensure role/db (user=$DB_USER db=$DB_NAME)"

# Admin (prefer SSM shared, fallback to container)
SH_PLAIN="$(aws ssm get-parameter --region "$REGION" --name "/infra/$ENV/shared/db/plain"  --query 'Parameter.Value' --output text 2>/dev/null || echo '{}')"
SH_SEC="$(aws ssm get-parameter --with-decryption --region "$REGION" --name "/infra/$ENV/shared/db/secure" --query 'Parameter.Value' --output text 2>/dev/null || echo '{}')"
ADMIN_USER="$(echo "$SH_PLAIN" | jq -r '.POSTGRES_USER // "postgres"')"
ADMIN_PASS="$(echo "$SH_SEC"   | jq -r '.POSTGRES_PASSWORD // empty')"
if [ -z "$ADMIN_PASS" ]; then
  ADMIN_PASS="$(docker exec postgres printenv POSTGRES_PASSWORD 2>/dev/null || true)"
  if [ -n "$ADMIN_PASS" ]; then
    aws ssm put-parameter --region "$REGION" --name "/infra/$ENV/shared/db/secure" --type SecureString --overwrite --value "$(jq -nc --arg p "$ADMIN_PASS" '{POSTGRES_PASSWORD:$p}')" >/dev/null || true
  fi
fi
[ -n "$ADMIN_PASS" ] || { log "No admin password available"; exit 3; }
docker ps --format '{{.Names}}' | grep -qx postgres || { log "postgres not running"; exit 4; }


# Ensure ROLE idempotently (server-side DO $$; does not echo the password)
# Ensure ROLE idempotently (no nested $$; no password echo)
log "ensuring role ${DB_USER}"
docker exec -e PGPASSWORD="$ADMIN_PASS" -i postgres \
  psql -U "$ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 \
  -v dbuser="$DB_USER" -v dbpass="$DB_PASS" <<'SQL'
\set ON_ERROR_STOP on
-- Pass values into server session as GUCs (avoids shell/dollar-quote pitfalls)
SET app.dbuser TO :'dbuser';
SET app.dbpass TO :'dbpass';

DO $do$
DECLARE
  v_user text := current_setting('app.dbuser', true);
  v_pass text := current_setting('app.dbpass', true);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_user) THEN
    EXECUTE 'CREATE ROLE ' || quote_ident(v_user) || ' LOGIN PASSWORD ' || quote_literal(v_pass);
  ELSE
    EXECUTE 'ALTER ROLE ' || quote_ident(v_user) || ' WITH PASSWORD ' || quote_literal(v_pass);
  END IF;
END
$do$;

RESET app.dbuser;
RESET app.dbpass;
SQL


# Ensure DATABASE (create if missing; ignore "already exists")
log "ensuring database ${DB_NAME}"
if ! docker exec -e PGPASSWORD="$ADMIN_PASS" -i postgres \
     createdb -U "$ADMIN_USER" -O "$DB_USER" "$DB_NAME" 2>/dev/null; then
  # Not created → check existence
  if ! docker exec -e PGPASSWORD="$ADMIN_PASS" -i postgres \
       psql -U "$ADMIN_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -qx 1; then
    log "db create failed and database not found"
    exit 5
  fi
fi

# Ensure ownership & privileges (idempotent, non-destructive)
# 1) Make DB owned by the app user (no-op if already owner)
docker exec -e PGPASSWORD="$ADMIN_PASS" -i postgres \
  psql -U "$ADMIN_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "ALTER DATABASE \"${DB_NAME}\" OWNER TO \"${DB_USER}\""

# 2) Basic schema privileges inside the DB
docker exec -e PGPASSWORD="$ADMIN_PASS" -i postgres \
  psql -U "$ADMIN_USER" -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<SQL
\set ON_ERROR_STOP on
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO "${DB_USER}";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${DB_USER}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${DB_USER}";
-- Future objects created by ADMIN_USER get granted to DB_USER by default:
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${DB_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, UPDATE ON SEQUENCES TO "${DB_USER}";
SQL

# Verify
docker exec -e PGPASSWORD="$ADMIN_PASS" postgres \
  psql -U "$ADMIN_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}';" | grep -qx 1 || { log "db create check failed"; exit 5; }

# Optional prisma migrate
if [ "${RUN_MIGRATIONS}" = "true" ]; then
  if docker exec "${APP}" sh -lc 'command -v npx >/dev/null 2>&1 && npx prisma --version >/dev/null 2>&1'; then
    log "running prisma migrate deploy"
    docker exec "${APP}" sh -lc 'npx prisma migrate deploy || true'
  fi
fi

log "ensure_db_ok ${DB_NAME}"
'''

# ---- main: ship in base64 chunks (no heredocs), print logs if verbose -------
import os


def main():
    ap = argparse.ArgumentParser(description="Ensure app DB/user via SSM")
    ap.add_argument('--env', default='auto')
    ap.add_argument('--app', default='auto')
    ap.add_argument('--run-migrations', action='store_true')
    ap.add_argument('--timeout', type=int, default=600)
    ap.add_argument('--verbose', action='store_true')
    args = ap.parse_args()

    env_name = resolve_env_name(args.env)
    app = resolve_app(args.app)
    ssm = boto3.client('ssm', region_name=os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION'))

    ec2_id = ssm_get_str(ssm, f"/infra/{env_name}/ci/ec2_instance_id")
    if not ec2_id:
        print(f"::error::Missing /infra/{env_name}/ci/ec2_instance_id", file=sys.stderr)
        return 2

    # 1) upload script in base64 chunks (safe with SSM commands)
    b64 = base64.b64encode(
        REMOTE_BASH.replace("${APP}", app)
        .replace("${ENV_NAME}", env_name)
        .replace("${RUN_MIGRATIONS}", "true" if args.run_migrations else "false")
        .encode('utf-8')
    ).decode('ascii')

    chunks = [b64[i:i + 1200] for i in range(0, len(b64), 1200)]  # short lines, safe for printf
    commands = [
        'set -euo pipefail',
        'rm -f /tmp/ensure_db.sh /tmp/ensure_db.sh.b64 || true',
    ]
    for c in chunks:
        commands.append(f'printf %s {shlex.quote(c)} >> /tmp/ensure_db.sh.b64')
    commands += [
        'base64 -d /tmp/ensure_db.sh.b64 > /tmp/ensure_db.sh',
        'chmod +x /tmp/ensure_db.sh',
        # inject env only on exec line (don’t leak secrets in logs)
        f'APP={shlex.quote(app)} ENV_NAME={shlex.quote(env_name)} RUN_MIGRATIONS={"true" if args.run_migrations else "false"} /tmp/ensure_db.sh',
    ]

    resp = ssm.send_command(
        DocumentName="AWS-RunShellScript",
        InstanceIds=[ec2_id],
        Parameters={"commands": commands},
        Comment=f"ensure_db for {app} ({env_name})",
    )
    cmd_id = resp['Command']['CommandId']
    status = wait_ssm_command(ssm, cmd_id, ec2_id, timeout=args.timeout, poll=5)
    print(f"ensure_db: SSM status = {status}")

    # Fetch logs (also on success if --verbose)
    if args.verbose or status != "Success":
        try:
            out = ssm.get_command_invocation(
                CommandId=cmd_id, InstanceId=ec2_id, PluginName='aws:runShellScript'
            )
            so = out.get('StandardOutputContent', '')
            se = out.get('StandardErrorContent', '')
            if so:
                safe = "\n".join(ln for ln in so.splitlines() if ln.startswith("ensure_db:"))
                if safe:
                    print("----- remote stdout -----")
                    print(safe)

            if se:
                print("----- remote stderr -----", file=sys.stderr)
                print(se, file=sys.stderr)
        except Exception:
            pass

    return 0 if status == "Success" else 1


if __name__ == "__main__":
    sys.exit(main())
