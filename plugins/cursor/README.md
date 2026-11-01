# Customermates plugin for Cursor

Connects Cursor to [Customermates](https://customermates.com), the open-source CRM with an MCP endpoint, so the Cursor agent can read and write your contacts, organizations, deals and tasks and search your company knowledge base.

## What it adds

- The `customermates` MCP server, pointing at `https://customermates.com/api/v1/mcp`.
- The `customermates-crm` skill: the workflow the server expects (read the workspace context and the record model first, change records only through `mutate_crm_record`, confirm before deleting or sending).

## Install

Add the plugin from the Cursor Directory, or copy the `mcpServers` block of `mcp.json` into `~/.cursor/mcp.json` (global) or `<project>/.cursor/mcp.json` (per project). The server uses the same configuration as the Connect to Cursor button in the Customermates docs: Cursor starts the OAuth sign-in on first use, where you sign in to Customermates and approve the connection for one workspace. No key is stored in a file.

## Use an API key instead

Create a key under Settings, API keys in Customermates (it carries the permissions of the user who creates it), export it as `CUSTOMERMATES_API_KEY` before you start Cursor and use this block:

```json
{
  "mcpServers": {
    "customermates": {
      "url": "https://customermates.com/api/v1/mcp",
      "headers": {
        "x-api-key": "${env:CUSTOMERMATES_API_KEY}"
      }
    }
  }
}
```

## Self-hosted instance

Replace the URL with `<BASE_URL>/api/v1/mcp` of your instance. A self-hosted server offers fewer tools than Customermates Cloud: the messaging, social and routine tools need the cloud plan. See the [self-hosting guide](https://customermates.com/docs/self-hosting#how-do-i-connect-an-ai-client-to-my-self-hosted-instance).

## Links

- [MCP reference](https://customermates.com/docs/mcp)
- [Connect CLI and editor clients](https://customermates.com/docs/connect-cli#cursor)
- [Customermates on GitHub](https://github.com/customermates/customermates)

## License

This folder is licensed under the MIT License, see `LICENSE` in this folder. The rest of the repository is licensed as described in [`LICENSING.md`](../../LICENSING.md).
