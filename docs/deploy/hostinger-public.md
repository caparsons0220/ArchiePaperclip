---
title: Hostinger Public Deployment
summary: Run one public Paperclip/Archie instance on a Hostinger VPS
---

Use this path when you want one public Paperclip/Archie instance on Hostinger for engine validation.

This repo includes:

- `docker/docker-compose.hostinger.yml`
- `docker/.env.hostinger.example`
- `.github/workflows/deploy-hostinger.yml`

## Recommended shape

- Hostinger VPS with the Docker template
- `authenticated` + `public`
- app container on Hostinger with Supabase Postgres as the system of record
- `app.archiebravo.com` as the app hostname
- Traefik on the VPS for HTTPS

## Deploy

1. Provision a Hostinger VPS with the Docker template.
2. Point `app.archiebravo.com` at the VPS IP.
3. Prepare a runtime env file from `docker/.env.hostinger.example`.
4. Deploy this repository with compose path:

   ```txt
   docker/docker-compose.hostinger.yml
   ```

5. Use either:

   - direct VPS compose:

     ```sh
     docker compose -p archie-bravo --env-file docker/.env.hostinger -f docker/docker-compose.hostinger.yml up -d --build
     ```

   - or Hostinger Docker Manager with the same env values.

Required values:

- `PAPERCLIP_PUBLIC_URL=https://app.archiebravo.com`
- `ARCHIE_HOSTNAME=app.archiebravo.com`
- `TRAEFIK_CERT_RESOLVER=<your Traefik resolver>`
- `BETTER_AUTH_SECRET=<long random secret>`
- `DATABASE_URL=<Supabase pooled runtime URL on 6543>`
- `DATABASE_MIGRATION_URL=<Supabase direct migration URL on 5432>`

Default values to keep for phase 1:

- `PAPERCLIP_DEPLOYMENT_MODE=authenticated`
- `PAPERCLIP_DEPLOYMENT_EXPOSURE=public`
- `PAPERCLIP_AUTH_DISABLE_SIGN_UP=false`
- `PAPERCLIP_DB_BACKUP_ENABLED=false`

The entrypoint auto-initializes Codex CLI auth when `OPENAI_API_KEY` is present.

## Reverse proxy and SSL

Traefik should discover the app automatically from the labels in the compose file.

Expected settings:

- host rule from `ARCHIE_HOSTNAME`
- `websecure` entrypoint
- TLS enabled
- certificate resolver from `TRAEFIK_CERT_RESOLVER`

## Firewall

Allow only:

- `80`
- `443`
- SSH

## First boot

If `/api/health` reports `bootstrap_pending`, generate the first admin invite:

```sh
docker compose -p archie-bravo --env-file docker/.env.hostinger -f docker/docker-compose.hostinger.yml exec -T archie-app pnpm paperclipai auth bootstrap-ceo
```

Open the invite URL, create the first operator via the normal email/password flow, then:

1. Create the first company.
2. Create one Archie agent.
3. Create one issue.
4. Invoke one run manually.

## Validate

- `https://app.archiebravo.com/api/health` works through the proxy
- login works over HTTPS
- agent runs complete
- a second run can continue from prior state
- restarting containers preserves `/paperclip`, while the primary DB remains in Supabase

## Optional GitHub Actions deploy

After the first manual deployment is healthy, use `.github/workflows/deploy-hostinger.yml` as a manual deploy entrypoint.

Hostinger references:

- [Docker VPS template](https://www.hostinger.com/support/8306612/)
- [Docker Manager](https://www.hostinger.com/support/12040789-hostinger-docker-manager-for-vps-simplify-your-container-deployments)
- [Private repo deploy keys](https://www.hostinger.com/support/how-to-deploy-from-private-github-repository-on-hostinger-docker-manager/)
- [GitHub Actions deployment](https://www.hostinger.com/support/deploy-to-hostinger-vps-using-github-actions/)
- [DNS to VPS](https://www.hostinger.com/support/1583227-how-to-point-a-domain-to-your-vps-at-hostinger/)
- [VPS firewall](https://www.hostinger.com/support/8172641-how-to-use-vps-firewall/)
