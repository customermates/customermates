<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/images/dark/customermates.svg">
    <source media="(prefers-color-scheme: light)" srcset="public/images/light/customermates.svg">
    <img src="public/images/light/customermates.svg" height="64" alt="Customermates">
  </picture>
</p>

<p align="center">Open Source CRM with AI agents, APIs, MCP, and self-hosting.</p>

<p align="center">
  <a href="https://customermates.com">Website</a> |
  <a href="https://demo.customermates.com">Demo</a> |
  <a href="https://customermates.com/docs">Documentation</a> |
  <a href="https://github.com/customermates/customermates">GitHub</a> |
  <a href="https://youtu.be/A7juUe3Iaco">Walkthrough</a>
</p>


<p align="center">
  <img src="public/customermates-promo.gif" alt="Customermates: 57 second walkthrough" width="1200">
</p>

Customermates is a CRM for modern teams that want a clear system for contacts, organizations, deals, services, and tasks without the usual enterprise-heavy setup. It combines practical CRM workflows with API access, webhooks, n8n automation, MCP-based tooling, and AI-agent workflows.

You can use the managed cloud version or run Customermates yourself in your own infrastructure with Docker Compose.

## 🚀 Getting Started

There are two ways to start using Customermates:

| Option | Description |
| --- | --- |
| **[Cloud](https://customermates.com)** | Fastest way to get started. Managed by Customermates. |
| **[Self-Hosting](https://customermates.com/docs/self-hosting)** | Run Customermates on your own server with Docker Compose and PostgreSQL. |

Docs entry points:

- [CRM Overview](https://customermates.com/docs)
- [Self-Hosting (install, manage, cloud vs self-host)](https://customermates.com/docs/self-hosting)
- [Connect your AI (Claude)](https://customermates.com/docs/mcp-connect-claude)
- [Webhooks](https://customermates.com/docs/webhooks)

## ⭐ Key Features

- CRM for contacts, organizations, deals, services, and tasks
- API access with OpenAPI documentation
- Webhooks and event-driven integrations
- n8n workflows and automation support
- MCP support for agent tooling and structured tool calling
- Enterprise features (Audit Logging, Single Sign-On, Whitelabeling) on Cloud paid plans or self-host with a license key
- Role-based access control for teams
- Self-hosted deployment with Docker Compose and PostgreSQL
- Cloud pricing from **€7/user/month** (yearly) or **€9/user/month** (monthly)

## 📊 Comparison

Customermates supports both cloud and self-hosted deployment models.

| Criterion | Cloud | Self-Hosted |
| --- | --- | --- |
| Pricing | from €7/seat (yearly) or €9/seat (monthly) | free core + infra costs |
| Setup Time | 2 minutes | ~15 minutes |
| Maintenance Required | None | Docker, Postgres, proxy, TLS, backups |
| Updates | Automatic | `docker compose pull && docker compose up -d` |
| EU-hosted | ✅ | wherever you put it |
| Backups | Automatic daily | You configure |
| API and integrations | ✅ | ✅ |
| Unlimited Users | ✅ | ✅ |
| Unlimited Records | ✅ | ✅ |
| n8n and automation workflows | ✅ | ✅ |
| Enterprise (Audit Log, SSO, Whitelabeling) | Paid plan | Paid license key |

If you want the full decision guide, see the [Self-hosting docs](https://customermates.com/docs/self-hosting).

## 🐳 Self-Hosting

Self-hosting is two files (`docker-compose.yml` and `.env`) plus `docker compose up -d`. No `git clone`, no build step. The published image at `ghcr.io/customermates/customermates:latest` runs migrations on first boot.

### Prerequisites

- Docker and Docker Compose v2.
- A domain name if you want TLS (optional for local).
- ~2 GB RAM and a couple of GB of disk per thousand records.

### Setup

```bash
mkdir customermates && cd customermates
curl -fsSL https://raw.githubusercontent.com/customermates/customermates/main/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/customermates/customermates/main/.env.selfhost.template -o .env
# edit .env with real values
docker compose up -d
```

Required `.env` values:

- `BETTER_AUTH_SECRET`: long random string (`openssl rand -hex 32`).
- `CRON_SECRET`: long random string used by the `webhook-worker` sidecar.
- `POSTGRES_PASSWORD`: change the default.
- `BASE_URL`: your public URL (e.g. `https://crm.example.com`).
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: for signup verification, password reset, and invitation emails.

First boot takes ~1 minute while Prisma applies migrations. Watch with `docker compose logs -f app`, then open `http://localhost:4000` (or your `APP_PORT`).

### Day-to-day

```bash
docker compose pull && docker compose up -d   # update
docker compose restart                         # restart after .env changes
docker compose logs -f app                     # logs
```

Front the app with a reverse proxy (Caddy, nginx, Traefik) for TLS. Customermates sets secure cookies when `BASE_URL` uses `https://` — make sure the proxy forwards `X-Forwarded-Proto`.

More docs:

- [Self-Hosting (install and manage)](https://customermates.com/docs/self-hosting)
- [Architecture and security](https://customermates.com/docs/architecture-security)

## 🛠️ Development

Run Customermates locally:

```bash
yarn install
yarn dev
```

Useful scripts:

- `yarn dev`
- `yarn build`
- `yarn lint`
- `yarn openapi:generate`
- `yarn db:reset`
- `yarn db:reseed`

## 📚 Documentation

The docs cover:

- product overview and CRM comparison
- self-hosting and operations
- API integrations and OpenAPI
- MCP and n8n
- architecture and security

Start here: [customermates.com/docs](https://customermates.com/docs)

## 📄 License

Customermates uses an open-core licensing model.

The community edition is licensed under [AGPLv3](./LICENSE). Files in `ee/` are subject to the commercial terms in [`ee/LICENSE.md`](./ee/LICENSE.md).

Contributor terms are available in [`.github/CLA.md`](./.github/CLA.md).
