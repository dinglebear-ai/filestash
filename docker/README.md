# Secure Compose Deployment

The example Compose file is a secure starting point for deployment behind an
HTTPS reverse proxy. It binds Filestash to loopback by default and never publishes
Collabora. Replace example values before the first start.

## Prepare secrets

```bash
install -d -m 0700 docker/secrets
openssl rand -base64 48 > docker/secrets/setup-token
openssl rand -base64 48 > docker/secrets/config-secret
chmod 0600 docker/secrets/setup-token docker/secrets/config-secret
```

The setup token must be at least 32 characters. It authorizes only first-run
admin configuration via `X-Filestash-Setup-Token` and is ignored after an admin
credential exists. Never put it in a URL, log, screenshot, or proxy config.

The config secret remains external to the state volume. Back it up in a secret
manager: losing it makes encrypted configuration unrecoverable. Do not rotate it
without following an application-supported decrypt/re-encrypt migration.

## Configure and start

```bash
export APPLICATION_URL=https://files.example.com
export COLLABORA_WOPI_ORIGIN='https://files\.example\.com:443'
export FILESTASH_IMAGE='registry.example.com/filestash@sha256:replace-with-reviewed-digest'
docker compose -f docker/docker-compose.yml config
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml ps
```

Terminate TLS at a trusted reverse proxy and forward only Filestash's loopback
port. Route the public office path to the internal Collabora integration according
to the proxy's WOPI guidance; do not publish port 9980. Preserve `Host`,
`X-Forwarded-Proto`, and the client IP headers from trusted proxies only.

On first visit, open `/admin/setup` over HTTPS and provide the setup token when
prompted. Confirm an admin credential is saved, then restart the service without
the setup secret if your deployment tooling permits. A missing or incorrect setup
token must produce HTTP 403 on first-run admin configuration APIs.

## Hardening and operations

- Compose requires an immutable Filestash image digest and pins the Collabora
  example by digest. Review release notes and update the tag/digest together; do
  not silently follow `latest` in production.
- Collabora is on an internal Docker network, uses a strict WOPI-origin regex,
  runs without the previous root shell/download override, and drops capabilities.
- Application and Collabora container logs use bounded local rotation. Filestash's
  file log and cache are bounded `tmpfs` mounts so request logs do not consume the
  durable state volume. Forward logs off-host if retention is required.
- Compose health checks `/healthz` and Collabora discovery, and starts Filestash
  only after Collabora is healthy. Monitor unhealthy/restart events externally;
  health checks do not replace alerting or rollback automation.
- Back up `filestash_state` and the external config secret separately. Test restore
  procedures before upgrades.
- Leave `FILESTASH_BIND_ADDRESS=127.0.0.1` unless a protected private network is
  deliberately providing the proxy boundary.

For a source-built image, set `FILESTASH_IMAGE` to the immutable SHA-tagged image
produced from `docker/Dockerfile`.
