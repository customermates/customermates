---
name: customermates
description: Unified CRM guidance for Customermates data operations.
always: true
---

# Customermates CRM

## Core Rules

- MCP is mandatory for CRM: whenever the user asks anything about CRM data or CRM workflows (contacts, organizations, deals, services, tasks, widgets, webhooks, onboarding, company settings), use Customermates MCP tools.
- Treat CRM questions as live-data questions. Do not answer from memory when tools can verify.
- Never guess CRM data values (counts, names, statuses, amounts, dates, IDs, ownership, or pipeline state). If data cannot be fetched, say so clearly.
- For CRM data questions, use MCP tools.
  - If native MCP tool calls are not available in the runtime, use **mcporter** as the MCP client.
  - **Allowed exception:** use `exec` only to run `mcporter ...` commands (never curl/raw HTTP, never print tokens).
- Never claim tools are unavailable unless an MCP attempt was made in this turn and failed (either a native MCP tool call, or a `mcporter call ...`).
- Never ask the user to connect/enable MCP before first attempting a quick MCP connectivity check in this turn (`mcporter list`).
- Never show technical details (IDs, UUIDs) in responses
- If a tool returns "Validation error:", fix the issue and retry automatically
- For long-running CRM operations, provide concise progress context while executing (what is being checked, what was found, and what happens next).
- Treat infrastructure values (hostnames, ports, machine IDs, tokens, internal routes, auth headers, env vars) as internal-only.
- Never expose infra internals in user-facing replies. If needed, provide only high-level guidance.

## Workflow

0. **Connectivity check (fast):** if you’re not sure MCP is reachable, run `mcporter list --output json`.
   - If the `customermates` server is missing/offline/auth-required, report that plainly and stop.

1. For contacts, organizations, deals, services, and tasks, use generic tools first (via MCP / mcporter):
   - `get_entity_configuration`
   - `filter_entity`
   - `count_entity`
   - `get_entity_details`
   - `batch_update_entity_custom_field`
   - `set_entity_notes`
   - `delete_entity`

2. For count questions ("how many", "count", "number of"), call `count_entity` first.

3. For search/list questions, call `filter_entity` first.

4. For any CRM data answer, run at least one relevant MCP call in the same turn.

### mcporter usage (when needed)

- List servers: `mcporter list --output json`
- Call a tool: `mcporter call customermates.<tool_name> --args '{...}' --output json`
- If you hit **Input validation error**, fix the argument names and retry automatically.

## OpenClaw webhook ingress

- Use public ingress via `$WEBHOOK_URL`.
- **Important:** `/hooks/agent` requires a JSON payload with a top-level `message` field (e.g. `{ "message": "..." }`).
  - Most third-party webhooks (including Customermates `contact.created`, etc.) do **not** send this shape.
  - Therefore, CRM webhooks should usually **NOT** point directly at `/hooks/agent`.
- Customermates webhooks typically cannot send custom auth headers; use the OpenClaw hook token embedded in the URL query (OpenClaw supports `x-openclaw-token`/`Authorization` headers too, but CRM webhooks usually can’t set them).
- For automations with non-`/hooks/agent` payload shapes, add an OpenClaw `hooks.mappings` entry that:
  - matches a custom hook path (e.g. `/hooks/cm-contact-created`)
  - converts the CRM payload into an agent run via `action: "agent"` + `messageTemplate`
  - (optionally) sets a stable `sessionKey` like `hook:customermates:contact:{{data.entityId}}`

Practical pattern (recommended):

1) Add a mapping in `openclaw.json`:
   - `match.path: "cm-contact-created"`
   - `action: "agent"`
   - `messageTemplate`: include the contact name/id and explicit instructions (e.g., “Create a follow-up task assigned to the current user”)

2) Configure the Customermates CRM webhook URL to:
   - take `$WEBHOOK_URL` and replace `/hooks/agent` with `/hooks/cm-contact-created`

3) Quick verification:
   - `curl -X POST <mappedHookUrl> -H 'content-type: application/json' -d '{"event":"contact.created","data":{...}}'`
   - confirm the agent run is accepted (`200`) and the downstream CRM action occurs.

## Contact webhook payload examples

- Treat contact webhook shapes below as examples only.
- Always query the OpenAPI endpoint for the current canonical schema before relying on field-level structure.
- OpenAPI path: `/v1/openapi.json`.
- Typical examples:
  - `contact.created`: `{ event, timestamp, data: { userId, companyId, entityId, payload } }`
  - `contact.deleted`: `{ event, timestamp, data: { userId, companyId, entityId, payload } }`
  - `contact.updated`: `{ event, timestamp, data: { userId, companyId, entityId, payload: { contact, changes } } }`