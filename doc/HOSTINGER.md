# Hostinger Public Deployment

Use this path to run one public Archie/Paperclip instance on a Hostinger VPS for engine validation.

Files added for this deployment:

- `docker/docker-compose.hostinger.yml`
- `docker/.env.hostinger.example`
- `.github/workflows/deploy-hostinger.yml`

## 1. Provision the VPS

- Create a Hostinger VPS with the Docker template.
- Recommended starting plan: `KVM 4`.
- Reserve `app.archiebravo.com` for the app. Keep the root domain free for the future marketing site.
- Run a label-aware reverse proxy on the VPS. The compose file in this repo is tuned for Traefik.

## 2. Point DNS

Point `app.archiebravo.com` at the VPS IP. Wait until DNS resolves before expecting HTTPS to pass.

## 3. Private repo access

If the repo is private, either:

- give the VPS a deploy key and pull the repo there, or
- use Docker Manager / GitHub Actions to deploy the repository without storing a clone on disk.

Hostinger guide:

- https://www.hostinger.com/support/how-to-deploy-from-private-github-repository-on-hostinger-docker-manager/

## 4. Prepare the runtime env

Copy `docker/.env.hostinger.example` into a real runtime env file and fill in the secrets.

Required values:

- `PAPERCLIP_PUBLIC_URL=https://app.archiebravo.com`
- `ARCHIE_HOSTNAME=app.archiebravo.com`
- `TRAEFIK_CERT_RESOLVER=<your Traefik resolver>`
- `BETTER_AUTH_SECRET=<long random secret>`
- `ARCHIE_DB_PASSWORD=<url-safe password>`

Default values to keep for phase 1:

- `PAPERCLIP_DEPLOYMENT_MODE=authenticated`
- `PAPERCLIP_DEPLOYMENT_EXPOSURE=public`
- `PAPERCLIP_AUTH_DISABLE_SIGN_UP=false`

Notes:

- the app is exposed to Traefik through Docker labels; it does not publish a host port
- PostgreSQL stays internal to Docker and is never published on a host port
- app state persists under the `/paperclip` volume
- when `OPENAI_API_KEY` is present, the container entrypoint initializes Codex CLI auth in `/paperclip/.codex` automatically

## 5. Deploy Archie from this repo

### Option A: direct VPS deploy

On the VPS, from the repository root:

```sh
docker compose \
  -p archie-bravo \
  --env-file docker/.env.hostinger \
  -f docker/docker-compose.hostinger.yml \
  up -d --build
```

### Option B: Hostinger Docker Manager

Create a Docker Manager project from this repository and set the compose path to:

```txt
docker/docker-compose.hostinger.yml
```

Provide the same env values from your runtime env file.

## 6. Reverse proxy and TLS

Traefik should discover the app automatically from the labels in `docker/docker-compose.hostinger.yml`.

Expected router inputs:

- host rule from `ARCHIE_HOSTNAME`
- `websecure` entrypoint
- TLS enabled
- certificate resolver from `TRAEFIK_CERT_RESOLVER`

## 7. Firewall

Use the Hostinger VPS firewall to allow:

- `80`
- `443`
- Hostinger SSH access

Hostinger guide:

- https://www.hostinger.com/support/8172641-how-to-use-vps-firewall

## 8. First boot

Check health first:

```sh
curl -fsS https://app.archiebravo.com/api/health
```

If `bootstrapStatus` is `bootstrap_pending`, generate the first admin invite:

```sh
docker compose \
  -p archie-bravo \
  --env-file docker/.env.hostinger \
  -f docker/docker-compose.hostinger.yml \
  exec -T archie-app \
  pnpm paperclipai auth bootstrap-ceo
```

Open the invite URL, create the first operator account, then:

1. Create the first company.
2. Create one Archie agent.
3. Create one issue/task.
4. Invoke the agent manually once.

If you want to stop open self-signup after the first operator exists, set `PAPERCLIP_AUTH_DISABLE_SIGN_UP=true` and redeploy.

## 9. Validation

Validate all of these before moving on to Archie-specific product edits:

- `https://app.archiebravo.com/api/health` returns healthy through Traefik
- login works over HTTPS
- a task can be created and assigned
- an agent run can be invoked and completes
- a second run can continue from prior state
- restarting the Archie project preserves the database and `/paperclip` state

## 10. Optional GitHub Actions deploy

After the first manual Hostinger deployment is healthy, you can use the manual workflow in:

```txt
.github/workflows/deploy-hostinger.yml
```

Repository configuration expected by that workflow:

Secrets:

- `HOSTINGER_API_KEY`
- `BETTER_AUTH_SECRET`
- `ARCHIE_DB_PASSWORD`
- `PERSONAL_ACCESS_TOKEN` (private repos only)
- `OPENAI_API_KEY` (optional)
- `ANTHROPIC_API_KEY` (optional)
- `GEMINI_API_KEY` (optional)

Variables:

- `HOSTINGER_VM_ID`
- `HOSTINGER_PROJECT_NAME` (optional, defaults to `archie-bravo`)
- `PAPERCLIP_PUBLIC_URL`
- `ARCHIE_HOSTNAME`
- `TRAEFIK_CERT_RESOLVER` (optional, defaults to `letsencrypt`)
- `ARCHIE_DB_NAME` (optional, defaults to `paperclip`)
- `ARCHIE_DB_USER` (optional, defaults to `paperclip`)
- `PAPERCLIP_AUTH_DISABLE_SIGN_UP` (optional, defaults to `false`)
- `PAPERCLIP_ALLOWED_HOSTNAMES` (optional)

Hostinger guide:

- https://www.hostinger.com/support/deploy-to-hostinger-vps-using-github-actions/
