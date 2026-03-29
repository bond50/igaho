#!/usr/bin/env python3
import argparse, sys, json
from common import (boto_clients, resolve_env_name, ssm_get_str, wait_ssm_command)

def main():
    ap = argparse.ArgumentParser(description="Trigger render_stack SSM document and wait")
    ap.add_argument('--env', default='auto')
    ap.add_argument('--acme-email', default='')
    ap.add_argument('--timeout', type=int, default=600)
    args = ap.parse_args()

    env_name = resolve_env_name(args.env)
    ssm = boto_clients()

    render_doc = ssm_get_str(ssm, f"/infra/{env_name}/ci/ssm_render_doc")
    ec2_id     = ssm_get_str(ssm, f"/infra/{env_name}/ci/ec2_instance_id")
    if not render_doc or not ec2_id:
        print(f"::error::Missing render_doc or ec2_id under /infra/{env_name}/ci/*", file=sys.stderr)
        return 2

    params = {
        "EnvName":  [env_name],
        "AcmeEmail":[args.acme_email or ""]
    }
    resp = ssm.send_command(
        DocumentName=render_doc,
        DocumentVersion="$LATEST",
        InstanceIds=[ec2_id],
        Parameters=params,
        Comment=f"render_stack after env sync ({env_name})"
    )
    command_id = resp['Command']['CommandId']
    status = wait_ssm_command(ssm, command_id, ec2_id, timeout=args.timeout, poll=5)
    print(f"render_stack: SSM status = {status}")
    return 0 if status == 'Success' else 1

if __name__ == "__main__":
    sys.exit(main())
