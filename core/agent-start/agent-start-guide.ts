export const AGENT_START_PATH = "/start.md";

export function agentStartUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}${AGENT_START_PATH}`;
}

export function agentStartGuide(baseUrl: string, locale: string): string {
  const base = baseUrl.replace(/\/+$/u, "");
  const docs = (slug: string) => `${base}/${locale}/docs/${slug}`;

  return [
    "# Set up Customermates for your user",
    "",
    "You are an AI agent. Your user pasted a prompt that pointed you here because they want Customermates, the source-available AI CRM for client teams, set up for their business. Follow these steps in order and talk to your user in their language.",
    "",
    "## 1. Connect to Customermates",
    "",
    `Customermates is an MCP server. Connect it as a remote MCP server with OAuth at \`${base}/api/v1/mcp\`. The consent screen lets your user sign in or create an account (14-day trial, no credit card) and choose the workspace.`,
    "",
    "If you cannot add an MCP server yourself, tell your user exactly where to add it in the app they are using you in, then wait until they confirm:",
    "",
    `- Claude (claude.ai, Desktop): Customize → Connectors → Add → Add custom connector, paste the URL above. ${docs("connect-custom-connector")}#claude`,
    `- ChatGPT: Plugins → + → Add custom MCP server, paste the URL above. ${docs("connect-custom-connector")}#chatgpt`,
    `- Grok: grok.com/connectors → New Connector → Custom. ${docs("connect-custom-connector")}#grok-bot`,
    `- Langdock: add an MCP integration with OAuth 2.0 (Dynamic Client Registration). ${docs("connect-custom-connector")}#langdock`,
    `- Claude Code, Codex, Cursor, Gemini CLI and other CLI or editor clients: use an API key from Settings → Connections → API keys. ${docs("connect-cli")}`,
    "",
    "## 2. Read the workspace",
    "",
    "Call `get_workspace_context` first. It returns the user, the workspace, connected accounts and the Knowledge Base's Operating Guide. Follow that guide for everything that comes after.",
    "",
    "## 3. Set it up with your user",
    "",
    "1. Ask your user in a few short questions what their business sells, who their clients are, how a deal moves from first contact to paid, and which channels they use (email, LinkedIn, WhatsApp, calendar).",
    "2. Propose a setup in plain words: the lists and fields, the pipeline stages, the views and the follow-up routines. Reuse what the workspace already has.",
    "3. Apply it only after your user approves it, then read it back and show them what you built.",
    "4. Offer to connect their inbox and calendar in Customermates (Settings → Connections) so follow-ups can be drafted from real conversations.",
    "",
    "## Rules",
    "",
    "- Never send a message, publish a post or delete anything without your user's explicit approval.",
    "- Never invent prices, deal amounts, contacts or sample records; leave unknown values empty and ask.",
    "- Keep sensitive personal data out of free-text fields unless your user asks for it.",
    "",
    "## More",
    "",
    `- Documentation: ${base}/${locale}/docs`,
    `- Full documentation index for agents: ${base}/llms.txt`,
    "",
  ].join("\n");
}
