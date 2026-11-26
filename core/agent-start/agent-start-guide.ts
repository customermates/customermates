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
    "You are an AI agent. Your user pasted a prompt that pointed you here because they want Customermates, the source-available AI CRM for small teams, connected and set up for their business. Your goal is a working workspace in a few minutes: connected, signed up, built from the best-fitting template, with their inbox connected. Follow these steps in order, keep every message short and talk to your user in their language.",
    "",
    "## 1. Connect and sign up",
    "",
    `Customermates is an MCP server. Connect it as a remote MCP server with OAuth at \`${base}/api/v1/mcp\`. One connection covers your user's whole Customermates account. On the consent screen your user signs in or creates an account in one step (14-day trial, no credit card) and approves the connection; no workspace is chosen there.`,
    "",
    "If you cannot add an MCP server yourself, tell your user exactly where to add it in the app they are using you in, then wait until they confirm:",
    "",
    `- Claude (claude.ai, Desktop): Customize → Connectors → Add → Add custom connector, paste the URL above. ${docs("connect-custom-connector")}#claude`,
    `- ChatGPT: Plugins → + → Add custom MCP server, paste the URL above. ${docs("connect-custom-connector")}#chatgpt`,
    `- Grok: grok.com/connectors → New Connector → Custom. ${docs("connect-custom-connector")}#grok-bot`,
    `- Langdock: add an MCP integration with OAuth 2.0 (Dynamic Client Registration). ${docs("connect-custom-connector")}#langdock`,
    `- Claude Code, Codex, Cursor, Gemini CLI and other CLI or editor clients: use an API key from Settings → Connections → API keys. An API key always works in the workspace it was created in. ${docs("connect-cli")}`,
    "",
    "## 2. Choose the workspace",
    "",
    "Call `list_workspaces` first. It lists every workspace of the account with its slug, your user's role, whether it is already set up (`setUp`), whether you can use it and its plan facts.",
    "",
    "- If workspaces exist, ask your user which one to use, unless there is only one. A workspace with `setUp` true is already built: build on its lists and records and never set it up a second time.",
    "- If there is none, or your user wants a new one, ask for the workspace name (usually the company name) and the team size (just them, 2-5, 6-20 or more than 20), then call `create_workspace`. Never create a second workspace when an existing one fits; ask your user first.",
    "- Pass the chosen workspace's slug as the `workspace` argument on every tool call from then on. When the account has several workspaces, a call without it is refused with the list of workspaces.",
    "",
    "Then call `get_workspace_context` with that `workspace`. It returns the user, the workspace, connected accounts, plan facts and the Knowledge Base's Operating Guide. Follow that guide for everything that comes after.",
    "",
    "## 3. Pick a template with your user",
    "",
    "1. Ask at most two short questions: what their business sells and to whom, and which channels they talk to clients on (email, LinkedIn, WhatsApp, calendar).",
    "2. Recommend the one or two templates below that fit best, each with one sentence on why it fits their business. Do not list them all.",
    "3. Once your user picks one, run the MCP prompt `setup-from-template` with its slug and the `workspace` argument (or read the resource `templates://<slug>`). It reads the workspace, proposes the plan and builds only after your user approves it.",
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
    "`list_workspaces` and `get_workspace_context` return each workspace's `plan`: the current `plan`, `onFreePlan`, `trialDaysLeft` (null outside a trial), `lostOnFree` (what stops working on the free plan), `keepsItRunning` (the plan that keeps it all running) and `choosePlanUrl` (where your user chooses a plan). Plan-limit refusals carry the same `choosePlanUrl`.",
    "",
    "- When your user asks for something their plan does not include (a limit, the inbox, connected accounts, Mate, routines, more seats), say which plan includes it, give them `choosePlanUrl` and carry on with what their plan allows.",
    "- When a feature they have not set up would clearly help with the task at hand (connect the inbox for drafted follow-ups, a routine for repeated work, inviting a teammate), mention it once, in one sentence.",
    "- When `trialDaysLeft` is small, mention once when the trial ends, what `lostOnFree` would stop and that `keepsItRunning` keeps it running.",
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
