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

  it("uses one icon-only context picker for click and slash entry", () => {
    const picker = read("agent-context-picker.tsx");
    const conversation = read("agent-conversation.tsx");
    const input = read("agent-composer-text-input.tsx");

    expect(picker).toContain('aria-keyshortcuts="/"');
    expect(picker).toContain('data-testid="agent-context-picker-trigger"');
    expect(picker).toContain('size="icon-sm"');
    expect(picker).toContain('label={t("AgentChat.context.addTooltip")}');
    expect(picker).not.toContain('t("AgentChat.context.add")');
    expect(input).toContain("isAgentContextSlashCommand");
    expect(conversation).toContain("restoreComposerFocusOnEscape={contextPickerOpenedBySlash}");
  });

  it("keeps compact context chips inline with composer, queued, and sent text", () => {
    const contexts = read("agent-composer-contexts.tsx");
    const conversation = read("agent-conversation.tsx");
    const input = read("agent-composer-text-input.tsx");
    const items = read("agent-chat-items.tsx");
    const queued = read("queued-prompt.tsx");

    expect(contexts).toContain('className="contents"');
    expect(contexts).toContain('size="sm"');
    expect(contexts).not.toContain("startContent=");
    expect(conversation).toContain("<AgentComposerTextInput");
    expect(input).toContain('data-testid="agent-composer-input-line"');
    expect(input).toContain('className="contents"');
    expect(input).toContain("agent-composer-editor inline break-words whitespace-pre-wrap");
    expect(items).not.toContain("flex-wrap items-center gap-1 rounded-xl");
    expect(queued).not.toContain("flex min-w-0 flex-1 flex-wrap items-center gap-1");
  });
});
