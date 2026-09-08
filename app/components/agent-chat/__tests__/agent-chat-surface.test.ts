import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const AGENT_CHAT_COMPONENTS = join(process.cwd(), "app/components/agent-chat");

function read(name: string): string {
  return readFileSync(join(AGENT_CHAT_COMPONENTS, name), "utf8");
}

describe("agent chat surface contract", () => {
  it("keeps the floating Ask AI panel raised while the composer adapts to its host", () => {
    const chat = read("agent-chat.tsx");
    const conversation = read("agent-conversation.tsx");
    const panel = chat.match(/<div[\s\S]*?data-testid="agent-panel"/)?.[0] ?? "";

    expect(panel).toContain("bg-card");
    expect(conversation).toContain("rounded-xl border border-input bg-input-background");
    expect(conversation).not.toContain("rounded-xl border border-input bg-card");
  });
});
