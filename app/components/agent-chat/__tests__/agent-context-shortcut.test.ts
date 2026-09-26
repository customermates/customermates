import { describe, expect, it } from "vitest";

import type { AgentContextSlashCommandInput } from "../agent-context-shortcut";

import { isAgentContextSlashCommand } from "../agent-context-shortcut";

function shortcutInput(overrides: Partial<AgentContextSlashCommandInput> = {}): AgentContextSlashCommandInput {
  return {
    altKey: false,
    ctrlKey: false,
    isComposing: false,
    key: "/",
    metaKey: false,
    selectionEnd: 0,
    selectionStart: 0,
    value: "",
    ...overrides,
  };
}

describe("agent context slash command", () => {
  it("opens at the start of a draft and after whitespace without depending on Shift", () => {
    expect(isAgentContextSlashCommand(shortcutInput())).toBe(true);
    expect(
      isAgentContextSlashCommand(
        shortcutInput({
          selectionEnd: 14,
          selectionStart: 14,
          value: "Keep my draft ",
        }),
      ),
    ).toBe(true);
  });

  it("does not take over a slash inside a word or URL", () => {
    expect(
      isAgentContextSlashCommand(
        shortcutInput({
          selectionEnd: 6,
          selectionStart: 6,
          value: "https:",
        }),
      ),
    ).toBe(false);
  });

  it.each([
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { isComposing: true },
    { key: "Enter" },
    { selectionEnd: 1, selectionStart: 0 },
  ])("does not intercept modified, composing, unrelated, or selection input: %o", (overrides) => {
    expect(isAgentContextSlashCommand(shortcutInput(overrides))).toBe(false);
  });
});
