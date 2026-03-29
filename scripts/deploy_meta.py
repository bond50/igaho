#!/usr/bin/env python3
import os, sys, json, boto3

def env_name():
    ref = (os.getenv("GITHUB_REF_NAME") or "").lower()
    if ref == "main": return "prod"
    if ref in ("develop","dev"): return "develop"
    return "develop"

def app_slug():
    s = os.getenv("APP") or os.getenv("APP_RAW") or os.getenv("GITHUB_REPOSITORY","").split("/")[-1]
    s = (s or "app").lower()
    import re; s = re.sub(r"[^a-z0-9]+","-", s).strip("-")
    return s or "app"

def main():
    aws_region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
    env = env_name()
    app = app_slug()
    image_uri = os.getenv("IMAGE_URI","").strip()
    container_port = int(os.getenv("CONTAINER_PORT","3000"))
    domains_json = os.getenv("DOMAINS_JSON","")
    domain = os.getenv("DOMAIN","")

    ssm = boto3.client("ssm", region_name=aws_region)
    path = f"/infra/{env}/apps/{app}/meta"
    try:
        cur = ssm.get_parameter(Name=path)["Parameter"]["Value"]
    except Exception:
        cur = "{}"

    try:
        doms = json.loads(domains_json) if domains_json else ([domain] if domain else [])
    except Exception:
        doms = []

    meta = {}
    try: meta = json.loads(cur)
    except Exception: pass

    if image_uri: meta["image"] = image_uri
    meta["enabled"] = meta.get("enabled", True)
    meta["container_port"] = meta.get("container_port", container_port)
    if doms: meta["domains"] = doms

    ssm.put_parameter(Name=path, Type="String", Overwrite=True, Value=json.dumps(meta, separators=(",",":")))
    print(f"Updated {path}")

if __name__ == "__main__":
    main()
