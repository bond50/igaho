#!/usr/bin/env python3
import os, re, json, time, sys, base64, string, random
import boto3
from botocore.exceptions import ClientError

def slugify_app(name: str) -> str:
    s = name.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or 'app'

def env_branch_to_env_name(branch: str) -> str:
    return 'prod' if branch == 'main' else 'develop'

def resolve_env_name(auto_value: str | None) -> str:
    if auto_value and auto_value != 'auto':
        return auto_value
    branch = os.getenv('GITHUB_REF_NAME', '').strip() or 'develop'
    return env_branch_to_env_name(branch)

def resolve_app(auto_value: str | None) -> str:
    if auto_value and auto_value != 'auto':
        return slugify_app(auto_value)
    raw = os.getenv('APP') or os.getenv('APP_RAW') or os.getenv('GITHUB_REPOSITORY', '').split('/')[-1] or 'app'
    return slugify_app(raw)

def load_json_from_env(varname: str) -> dict:
    raw = os.getenv(varname, '').strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception as e:
        print(f"::error::{varname} is not valid JSON: {e}", file=sys.stderr)
        raise

def deep_merge(a: dict, b: dict) -> dict:
    out = dict(a or {})
    for k, v in (b or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out

def boto_clients():
    region = os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION') or 'us-east-1'
    ssm = boto3.client('ssm', region_name=region)
    return ssm

def ssm_get_json(ssm, name: str, with_decryption=False) -> dict:
    try:
        resp = ssm.get_parameter(Name=name, WithDecryption=with_decryption)
        val = resp['Parameter']['Value']
        return json.loads(val) if val else {}
    except ClientError as e:
        if e.response['Error']['Code'] in ('ParameterNotFound',):
            return {}
        raise

def ssm_get_str(ssm, name: str, with_decryption=False) -> str | None:
    try:
        resp = ssm.get_parameter(Name=name, WithDecryption=with_decryption)
        return resp['Parameter']['Value']
    except ClientError as e:
        if e.response['Error']['Code'] in ('ParameterNotFound',):
            return None
        raise

def ssm_put_json(ssm, name: str, value: dict, secure=False):
    ssm.put_parameter(
        Name=name,
        Type='SecureString' if secure else 'String',
        Overwrite=True,
        Value=json.dumps(value, separators=(',', ':'))
    )

def random_password(n: int = 32) -> str:
    # Alnum only (friendly for URLs)
    alphabet = string.ascii_letters + string.digits
    return ''.join(random.SystemRandom().choice(alphabet) for _ in range(n))

def wait_ssm_command(ssm, command_id: str, instance_id: str, timeout=600, poll=5) -> str:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            r = ssm.get_command_invocation(CommandId=command_id, InstanceId=instance_id)
            last = r.get('Status')
            if last in ('Success', 'Cancelled', 'TimedOut', 'Failed'):
                return last
        except ClientError:
            pass
        time.sleep(poll)
    return last or 'Unknown'
