# Customermates MCP server: install guide for AI agents

Customermates is an open-source CRM. Its MCP server is part of the app and runs over Streamable HTTP at `<BASE_URL>/api/v1/mcp`. There is nothing to install or build. Use `https://customermates.com` as BASE_URL for the managed cloud, or the address of a self-hosted instance.

## What you need from the user

1. A Customermates account (cloud trial, 7 days, no card) or a self-hosted instance.

2. An API key: Settings, API keys, Add, Standard API key. The key has 64 characters, is shown once and carries the permissions of the user who created it.

Ask the user to paste the key. Never invent or log it.

## Configure Cline

Add this to `cline_mcp_settings.json`, replacing `YOUR_KEY`. Keep `type` set to `streamableHttp`; without it Cline falls back to the legacy SSE transport.

```json
{
  "mcpServers": {
    "customermates": {
      "type": "streamableHttp",
      "url": "https://customermates.com/api/v1/mcp",
      "headers": {
        "x-api-key": "YOUR_KEY"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

For a self-hosted instance use `https://<their-host>/api/v1/mcp` as the URL.

## Check

The server is connected when Cline lists the Customermates tools. HTTP 401 means the key is wrong, truncated or expired: create a new key and update the header.

## First steps

Call `discover_record_types`, then `get_record_model` for the types you need, before writing records, because every workspace defines its own lists and fields. The built-in `get-started` prompt guides a first session.
