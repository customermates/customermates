export const MCP_SERVER_INSTRUCTIONS = `Customermates CRM. Five record types (contacts, organizations, deals, services, tasks), all with user-defined custom columns. Deal stage and task status are singleSelect custom columns, not fixed fields. Flow: call get_record_schema first (fields and custom-column ids vary per workspace), find ids with search_records or list_records, write with the per-entity create_*/update_* tools. Relations change ONLY via manage_record_links; update_* never touches them. Confirm with the user before delete_records or any send_* tool.

Conventions:
- Contact ids: a UUID, or a channel the contact owns: an email, a phone, or 'provider:handle' (linkedin, telegram, instagram).
- Never guess custom-column ids or singleSelect option ids; read them from get_record_schema.
- List results are TOON-encoded tables with id and name first; page through with page/pageSize, total is always included.
- save_message_draft prepares a reply for the user to review and send from their inbox; send_email and send_chat_message deliver immediately.
- Start a session with get_workspace_context to learn the user, company, roles, and connected messaging accounts.
- To connect a new messaging channel (WhatsApp, LinkedIn, email, Instagram, Telegram), call connect_messaging_account; it returns a link the user opens in a browser to finish auth. You cannot complete the connection yourself, so hand the link over and ask them to open it.
- All tools are enabled by default. Appending ?toolsets=records,messaging,... to the server URL narrows the surface; omitting it keeps everything.`;

export const GET_STARTED_PROMPT = `Connected to my Customermates CRM via MCP.

First ask me: my name and role, and what I mainly use the CRM for.
Then call get_workspace_context and get_record_schema, summarize my workspace in one short paragraph, and ask what to focus on.
Confirm with me before any delete or send action.`;
