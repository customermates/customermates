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
  <a href="https://github.com/customermates/customermates">GitHub</a>
</p>


<p align="center">
  <video src="https://github.com/user-attachments/assets/e759d0dc-8f7e-4ef4-80da-c7a407aa1b56" width="1200" autoplay loop muted playsinline></video>
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
- Cloud-only enterprise features: Audit Logging, Single Sign-On, and Whitelabeling
- Role-based access control for teams
- Self-hosted deployment with Docker Compose and PostgreSQL
- Cloud pricing from **€9**

## 📊 Comparison

Customermates supports both cloud and self-hosted deployment models.

| Criterion | Cloud | Self-Hosted |
| --- | --- | --- |
| Pricing | €9 | Infrastructure and ops costs vary |
| Setup Time | 2 minutes | 60 - 120 minutes |
| Maintenance Required | None | Regular updates |
| Privacy friendly | ✅ | ✅ |
| API and integrations | ✅ | ✅ |
| Unlimited Users | ✅ | ✅ |
| Unlimited Records | ✅ | ✅ |
| n8n and automation workflows | ✅ | ✅ |
| Audit Logging | ✅ | ❌ |
| Single Sign-On | ✅ | ❌ |
| Whitelabeling | ✅ | ❌ |

If you want the full decision guide, see the [Self-hosting docs](https://customermates.com/docs/self-hosting).

## 🐳 Self-Hosting

Customermates can be deployed on your own infrastructure with Docker Compose.

### Prerequisites

- A VPS with Docker Engine and Docker Compose installed
- A domain pointing to your server
- PostgreSQL via Docker Compose
- A reverse proxy with HTTPS termination for production usage

### Setup

No need to clone the repo. Download the required files and run the setup script:

```bash
mkdir customermates && cd customermates
curl -O https://raw.githubusercontent.com/customermates/customermates/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/customermates/customermates/main/.env.selfhost.template
curl -O https://raw.githubusercontent.com/customermates/customermates/main/scripts/selfhost-setup.sh
mv .env.selfhost.template .env
# edit .env with your values
chmod +x selfhost-setup.sh
./selfhost-setup.sh
```

Useful self-hosting scripts:

- `scripts/selfhost-setup.sh`
- `scripts/selfhost-update.sh`
- `scripts/selfhost-restart.sh`
- `scripts/selfhost-reset.sh`

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
