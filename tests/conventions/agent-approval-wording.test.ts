import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildAgentSystemPrompt } from "@/ee/agent-chat/system-prompt";
import { requiresApproval } from "@/ee/agent-chat/gated-tools";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";
import { ALL_MCP_TOOLS } from "@/features/mcp-tools/tool-registry";
import { MCP_SERVER_INSTRUCTIONS, GET_STARTED_PROMPT } from "@/features/mcp-tools/server-instructions";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const chatPrompt = buildAgentSystemPrompt({
  userName: "Ada Lovelace",
  appBaseUrl: "https://app.example.com",
  locale: "en",
  surface: "chat",
});

const toolByName = (name: string) => ALL_MCP_TOOLS.find((tool) => tool.name === name);

const gatedAtRuntime = (name: string) => {
  const tool = toolByName(name);
  if (!tool) throw new Error(`unknown tool in approval wording test: ${name}`);
  return requiresApproval(internalToolIdentity(name), { annotations: tool.annotations }, {});
};

describe("agent approval wording matches runtime behaviour", () => {
  it("never claims a tool asks for approval when it does not", () => {
    const claimed = ["send_email", "send_chat_message", "delete_records"];
    const promised = claimed.filter((name) => chatPrompt.includes(name) && /approval/i.test(chatPrompt));
    for (const name of promised) {
      const namedInApprovalParagraph = chatPrompt
        .split("\n")
        .some((line) => line.includes(name) && /require a fresh explicit approval/.test(line));
      if (namedInApprovalParagraph) expect(gatedAtRuntime(name), `${name} is promised an approval`).toBe(true);
    }
  });

  it("keeps delete_records gated and both send tools immediate", () => {
    expect(gatedAtRuntime("delete_records")).toBe(true);
    expect(gatedAtRuntime("send_email")).toBe(false);
    expect(gatedAtRuntime("send_chat_message")).toBe(false);
  });

  it("tells the model that the send tools deliver on call", () => {
    expect(chatPrompt).toMatch(/send_email and send_chat_message deliver to a real recipient the moment you call them/);
    expect(chatPrompt).toMatch(/save_message_draft/);
  });

  it("states that approval is raised by calling the tool, from one shared definition", () => {
    const instruction = "Approval is requested by calling the tool";
    expect(chatPrompt).toContain(instruction);
    expect(MCP_SERVER_INSTRUCTIONS).toContain(instruction);
    expect(GET_STARTED_PROMPT).toContain(instruction);

    const definitions = read("features/mcp-tools/server-instructions.ts").match(
      /Approval is requested by calling the tool/g,
    );
    expect(definitions).toHaveLength(1);
    expect(read("ee/agent-chat/system-prompt.ts")).not.toContain(instruction);
  });

  it("no longer instructs the model to ask permission in prose instead of calling", () => {
    expect(MCP_SERVER_INSTRUCTIONS).not.toMatch(/Confirm with the user before/);
    expect(GET_STARTED_PROMPT).not.toMatch(/Confirm with me before/);
  });

  it("warns an unattended run that approvals will be declined, and does not warn an attended one", () => {
    const routinePrompt = buildAgentSystemPrompt({
      userName: "Ada Lovelace",
      appBaseUrl: "https://app.example.com",
      locale: "en",
      surface: "routine",
    });
    expect(routinePrompt).toMatch(/declined automatically rather than granted/);
    expect(chatPrompt).not.toMatch(/declined automatically rather than granted/);
  });

  it("keeps the shipped approval docs consistent with the runtime", () => {
    for (const locale of CONTENT_LOCALES) {
      const docs = read(`content/docs/${locale}/app-assistant.mdx`);
      const table = docs.slice(docs.indexOf("| "), docs.indexOf("\n\n", docs.indexOf("| ")));
      expect(table, `${locale} always-asks table`).not.toMatch(/Sending an email or chat message|E-Mail oder Chat-Nachricht senden/);
    }
  });
});
