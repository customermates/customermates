import packageInfo from "@/package.json";

export const MCP_SERVER_INFO = { name: "Customermates", version: packageInfo.version };

export const MCP_GET_STARTED_PROMPT_INFO = {
  name: "get-started",
  title: "Get started",
  description: "Personalized CRM kickoff: read the workspace and Knowledge Base, then ask what to focus on",
};

export const MCP_SETUP_FROM_TEMPLATE_PROMPT_INFO = {
  name: "setup-from-template",
  title: "Set up from a template",
  description:
    "Build a workspace from a Customermates template: read the workspace first, propose the plan, then build only after approval",
  arguments: [{ name: "template", description: "The template slug, for example client-tracker", required: true }],
};

export const MCP_TEMPLATE_RESOURCE_INFO = {
  name: "workspace-template",
  uriTemplate: "templates://{slug}",
  title: "Template",
  description:
    "A Customermates template: its language-neutral spec, its text in the workspace language, the compiled setup plan and the follow-up rules",
  mimeType: "application/json",
};
