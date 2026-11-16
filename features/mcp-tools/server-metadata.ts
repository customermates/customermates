import packageInfo from "@/package.json";

export const MCP_SERVER_ICON = {
  src: "https://customermates.com/images/email/customermates-icon@2x.png",
  mimeType: "image/png",
  sizes: ["160x160"],
};

export const MCP_SERVER_INFO = {
  name: "Customermates",
  version: packageInfo.version,
  icons: [MCP_SERVER_ICON],
};

export const MCP_GET_STARTED_PROMPT_INFO = {
  name: "get-started",
  title: "Get started",
  description: "Personalized CRM kickoff: read the workspace and Knowledge Base, then ask what to focus on",
};
