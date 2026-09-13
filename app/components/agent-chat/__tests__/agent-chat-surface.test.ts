import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OVERLAY_RAISED_PANEL_LAYER_CLASS, OVERLAY_TOPMOST_LAYER_CLASS } from "@/components/ui/overlay-contract";

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
    expect(panel).toContain("OVERLAY_RAISED_PANEL_LAYER_CLASS");
    expect(conversation).toContain("rounded-xl border border-input bg-input-background");
    expect(conversation).not.toContain("rounded-xl border border-input bg-card");
  });

  it("keeps page menus below Ask AI and Ask AI's own overlays above it", () => {
    expect(OVERLAY_RAISED_PANEL_LAYER_CLASS).toBe("z-[60]");
    expect(OVERLAY_TOPMOST_LAYER_CLASS).toBe("z-[70]");
    expect(read("chat-ui.tsx")).toContain("OVERLAY_TOPMOST_LAYER_CLASS");
    expect(read("usage-ring.tsx")).toContain("OVERLAY_TOPMOST_LAYER_CLASS");
    expect(read("agent-tour-overlay.tsx")).toContain("OVERLAY_TOPMOST_LAYER_CLASS");
    expect(read("conversation-history.tsx")).toContain("layerClassName={OVERLAY_TOPMOST_LAYER_CLASS}");
  });
});
