#!/usr/bin/env python3
import argparse
import sys

from common import (boto_clients, load_json_from_env, ssm_get_json, ssm_put_json,
                    resolve_env_name, resolve_app, deep_merge, random_password)


def main():
    ap = argparse.ArgumentParser(description="Merge app env to SSM and ensure DB secrets")
    ap.add_argument('--env', default='auto', help='Environment (prod/develop or auto)')
    ap.add_argument('--app', default='auto', help='App slug or auto')
    args = ap.parse_args()

    env_name = resolve_env_name(args.env)
    app = resolve_app(args.app)

    ssm = boto_clients()

    # Inputs from CI
    public_env = load_json_from_env('PUBLIC_ENV_JSON')  # vars, safe to be public-ish
    secure_in = load_json_from_env('RUNTIME_SECURE_JSON')  # secrets from GH Secrets

    # Current SSM values (if any)
    base_plain = f"/infra/{env_name}/{app}/env/plain"
    base_secure = f"/infra/{env_name}/{app}/env/secure"
    cur_plain = ssm_get_json(ssm, base_plain, with_decryption=False)
    cur_secure = ssm_get_json(ssm, base_secure, with_decryption=True)

    # Merge (incoming overrides current)
    new_plain = deep_merge(cur_plain, public_env)
    merged_sec = deep_merge(cur_secure, secure_in)

    # DB identity
    db_user = app
    db_name = f"{app}_db"

    # DB_PASS: prefer incoming, else current, else generate
    db_pass = merged_sec.get('DB_PASS') or cur_secure.get('DB_PASS') or random_password(32)

    # DATABASE_URL
    database_url = f"postgresql://{db_user}:{db_pass}@postgres:5432/{db_name}?sslmode=disable"

    # Derived keys (do not print secrets)
    new_plain['DB_USER'] = db_user
    new_plain['DB_NAME'] = db_name

    # Auth.js safety
    if not new_plain.get('AUTH_URL') and not new_plain.get('NEXTAUTH_URL'):
        client_url = new_plain.get('NEXT_PUBLIC_CLIENT_URL', '')
        if client_url:
            new_plain['AUTH_URL'] = client_url
    if not new_plain.get('AUTH_TRUST_HOST'):
        new_plain['AUTH_TRUST_HOST'] = "true"

    new_secure = dict(merged_sec)
    new_secure['DB_PASS'] = db_pass
    new_secure['DATABASE_URL'] = database_url

    # Write back to SSM
    ssm_put_json(ssm, base_plain, new_plain, secure=False)
    ssm_put_json(ssm, base_secure, new_secure, secure=True)

    # Tiny, non-secret summary
    print(f"env_sync: wrote /infra/{env_name}/{app}/env/plain+secure")
    print(
        f"env_sync: DB_USER={db_user} DB_NAME={db_name} (DB_PASS generated? {'yes' if 'DB_PASS' not in secure_in else 'no'})")


if __name__ == "__main__":
    sys.exit(main())
