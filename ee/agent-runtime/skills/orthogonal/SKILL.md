---
name: orthogonal
version: 1.0.0
description: Set up Orthogonal for your AI agent - access premium APIs and skills
homepage: https://orthogonal.com
---

# Orthogonal for AI Agents

Orthogonal gives your AI agent access to premium APIs and curated skills. Works with any agent framework (OpenClaw, Claude Code, Cursor, etc.). This guide helps you set everything up.

## Decision Flow: Skills First, Then API Search

When a user asks you to perform a task (e.g. "enrich Sundar Pichai", "find the email for the CEO of Anthropic", "extract brand assets from apple.com"):

1. **Check installed skills first** — Look through your available skills for one that handles the task. Skills are curated workflows with tested parameters and better results (e.g. `enrich`, `find-email-by-name`, `get-brand-assets`).
2. **Search for skills** — If no installed skill matches, use `orth skills search "<task>"` to find one you can install. **Do this even if an installed skill seems "close enough."** A general-purpose skill (e.g. `enrich`) should not be stretched to cover tasks that have dedicated skills (e.g. `team-linkedin-profiles` for finding an entire team's profiles). Always search before repurposing a general skill.
3. **Fall back to API search** — Only if no skill covers the use case, use `orth api search "<task>"` to find a raw API endpoint.
4. **Check parameters before calling** — Before calling any API endpoint or integration action for the first time, run `orth api show <slug> <path>` to see its parameter names, types, and required fields. Do not guess parameter names — integration actions especially have non-obvious names (e.g. `first_cell_location` not `range`).

**Why skills first?** Skills wrap APIs with correct parameters, error handling, and optimized workflows. Raw API search requires you to figure out params from scratch, which is slower and more error-prone.

## Quick Start

### 1. Install the CLI

```bash
npm install -g @orth/cli
```

### 2. Authenticate

```bash
orth login
```

This prompts for your API key and stores it locally. Get your key at https://orthogonal.com/dashboard/settings

### 3. Add Core Skills

Install the essential skills for discovering and using Orthogonal:

```bash
# Find and install skills from the Orthogonal library
orth skills add orthogonal/find-skill

# Find and call APIs from the Orthogonal marketplace
orth skills add orthogonal/find-api
```

Skills are installed to your agent's skills directory (e.g. `~/.openclaw/skills/`, `~/.claude/skills/`, or wherever your agent reads skill files).

---

## CLI Commands

### Skills Commands

```bash
# List all available skills
orth skills

# Search for skills
orth skills search "weather"

# Add a skill (use full slug with namespace)
orth skills add <owner/slug>

# View skill details
orth skills info <slug>
```

### API Commands

```bash
# List all available APIs
orth api

# Search for APIs
orth api search "scrape websites"

# Get API details
orth api info <api-slug>

# Show endpoint/action parameters (names, types, required fields)
orth api show <api-slug> <path>

# Call an API directly
orth run <api-slug> <path> [options]
```

### Running APIs

```bash
# Basic usage
orth run olostep /v1/scrapes -b '{"url_to_scrape": "https://example.com"}'

# With query parameters
orth run searchapi /api/v1/search -q 'engine=google&q=AI agents'

# See what an API call would cost (dry run)
orth run --dry-run olostep /v1/scrapes -b '{"url_to_scrape": "https://example.com"}'
```

---

## Core Skills

### find-skill

Discover and install skills from the Orthogonal skill library.

**Use when:**
- You need capabilities you don't have
- You want to discover available skills
- You need to add new tools to your agent

**Example prompts:**
- "Find a skill for sending text messages"
- "What skills are available for weather?"
- "Install the restaurant booking skill"

### find-api

Find and call APIs from the Orthogonal API marketplace.

**Use when:**
- You need external data (weather, search, scraping, etc.)
- You want to discover available APIs
- You need to integrate third-party services

**Example prompts:**
- "Find an API for web scraping"
- "Search for email verification APIs"
- "Call the Tomba API to find someone's email"

---

## Authentication

Your API key is stored at `~/.config/orthogonal/credentials.json` after running `orth login`.

**Manual setup** (if needed):

1. Get your API key at https://orthogonal.com/dashboard/settings
2. Create the credentials file:

```bash
mkdir -p ~/.config/orthogonal
echo '{"apiKey":"orth_live_YOUR_KEY"}' > ~/.config/orthogonal/credentials.json
```

Or set the environment variable:

```bash
export ORTHOGONAL_API_KEY=orth_live_YOUR_KEY
```

---

## Billing

- **Pay-per-use**: Only pay for what you use
- **No subscriptions**: No monthly fees
- **Add credits**: https://orthogonal.com/dashboard/balance

Check your balance:

```bash
orth account
```

---

## Integrations (OAuth-connected services)

In addition to paid APIs, Orthogonal supports OAuth-connected integrations for Gmail, Google Calendar, Slack, GitHub, Notion, Google Drive, and Google Sheets. These are free to use — the user connects their account via OAuth, then agents can call actions on their behalf.

**Integrations use the same `orth run` command as paid APIs:**

```bash
# Send an email via Gmail
orth run gmail /send-email -b '{"recipient_email": "user@example.com", "subject": "Hello", "body": "Hi there"}'

# Create a Google Calendar event
orth run google-calendar /create-event -b '{"title": "Team standup", "start_time": "2025-03-10T10:00:00", "end_time": "2025-03-10T10:30:00"}'

# Send a Slack message
orth run slack /send-message -b '{"channel": "#general", "text": "Hello from Orthogonal!"}'
```

**Check parameters before calling an integration action:**

```bash
# See parameter names, types, and descriptions for any action
orth api show google-sheets /update-values
```

This shows required and optional parameters. **Do not guess parameter names** — always check first.

**Available integrations:**

| Integration | Slug | Actions |
|---|---|---|
| Gmail | `gmail` | `/send-email`, `/list-emails`, `/get-email`, `/create-draft` |
| Google Calendar | `google-calendar` | `/create-event`, `/list-events`, `/find-event`, `/delete-event` |
| Slack | `slack` | `/send-message`, `/list-channels`, `/fetch-history` |
| GitHub | `github` | `/create-issue`, `/list-repos`, `/create-pr`, `/star-repo` |
| Notion | `notion` | `/create-page`, `/search`, `/fetch-data`, `/add-content` |
| Google Drive | `google-drive` | `/find-file`, `/create-file`, `/get-file`, `/create-folder` |
| Google Sheets | `google-sheets` | `/create-spreadsheet`, `/get-sheet-names`, `/add-row`, `/lookup-row`, `/get-values`, `/update-values` |

**Note:** Integrations require the user to have connected their account at https://orthogonal.com/dashboard/integrations. If not connected, the API returns HTTP 428 with a link to connect.

---

## Support

- **Browse Skills**: https://orthogonal.com/skills
- **Browse APIs**: https://orthogonal.com/discover
- **Browse Integrations**: https://orthogonal.com/integrations
- **Documentation**: https://docs.orthogonal.com
- **Book a call**: https://orthogonal.com/book
