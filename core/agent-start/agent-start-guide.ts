export const AGENT_START_PATH = "/start.md";

export type AgentStartTemplate = {
  slug: string;
  name: string;
  summary: string;
};

export function agentStartUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}${AGENT_START_PATH}`;
}

export function agentStartGuide(baseUrl: string, locale: string, templates: readonly AgentStartTemplate[]): string {
  const base = baseUrl.replace(/\/+$/u, "");
  const docs = (slug: string) => `${base}/${locale}/docs/${slug}`;

  return [
    "# Set up Customermates for your user",
    "",
    "You are an AI agent. Your user pasted a prompt that pointed you here because they want Customermates, the source-available AI CRM for client teams, connected and set up for their business. Your goal is a working workspace in a few minutes: connected, signed up, built from the best-fitting template, with their inbox connected. Follow these steps in order, keep every message short and talk to your user in their language.",
    "",
    "## 1. Connect and sign up",
    "",
    `Customermates is an MCP server. Connect it as a remote MCP server with OAuth at \`${base}/api/v1/mcp\`. The consent screen lets your user sign in or create an account in one step (14-day trial, no credit card) and choose the workspace.`,
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
    "Call `get_workspace_context` first. It returns the user, the workspace, connected accounts and the Knowledge Base's Operating Guide. Follow that guide for everything that comes after. If the workspace already has lists and records, build on them instead of starting over.",
    "",
    "## 3. Pick a template with your user",
    "",
    "1. Ask at most two short questions: what their business sells and to whom, and which channels they talk to clients on (email, LinkedIn, WhatsApp, calendar).",
    "2. Recommend the one or two templates below that fit best, each with one sentence on why it fits their business. Do not list them all.",
    "3. Once your user picks one, run the MCP prompt `setup-from-template` with its slug (or read the resource `templates://<slug>`). It reads the workspace, proposes the plan and builds only after your user approves it.",
    "4. If no template fits, propose a custom setup in plain words (lists, fields, pipeline stages, views, follow-up routines), apply it only after your user approves it, then read it back and show them what you built.",
    "",
    ...templateLines(templates, base, locale),
    "",
    "## 4. Connect the inbox",
    "",
    "Offer to connect their email, LinkedIn or WhatsApp in Customermates (Settings → Connections), so Mate and you can draft follow-ups from real conversations. This is the step that makes the CRM useful every day, so ask for it before you finish.",
    "",
    "## 5. Plans and upgrades",
    "",
    `Customermates is a paid product with a free trial. Plans, limits and prices are on ${base}/${locale}/pricing; read them there or with \`search_docs\`, never from memory.`,
    "",
    "- When your user asks for something their plan does not include (a limit, the inbox, connected accounts, Mate, routines, more seats), say which plan includes it, link the pricing page and carry on with what their plan allows.",
    "- When a feature they have not set up would clearly help with the task at hand (connect the inbox for drafted follow-ups, a routine for repeated work, inviting a teammate), mention it once, in one sentence.",
    "- In the last days of a trial, mention once when it ends and what keeps working on which plan.",
    "- Never invent prices, discounts or features, never repeat an offer your user declined and never interrupt a task for it.",
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
    `- All templates: ${base}/${locale}/templates`,
    `- Full documentation index for agents: ${base}/llms.txt`,
    "",
  ].join("\n");
}

function templateLines(templates: readonly AgentStartTemplate[], base: string, locale: string): string[] {
  if (templates.length === 0) return [`Templates: ${base}/${locale}/templates`];
  return [
    "Templates (slug: name, what it sets up):",
    "",
    ...templates.map(
      (template) =>
        `- \`${template.slug}\`: ${template.name}. ${template.summary} ${base}/${locale}/templates/${template.slug}`,
    ),
  ];
}
