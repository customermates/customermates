import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";

import { agentContextAttachmentKey } from "@/ee/agent-chat/agent-context";

const harness = vi.hoisted(() => ({
  focusAgentComposer: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { label?: string }) =>
    key === "AgentChat.context.remove" ? `Remove ${values?.label}` : key,
}));
vi.mock("@/components/chip/app-chip", async () => {
  const React = await import("react");
  return {
    AppChip: ({
      children,
      className,
      endContent,
      size,
    }: {
      children?: ReactNode;
      className?: string;
      endContent?: ReactNode;
      size?: string;
    }) => React.createElement("span", { className, "data-chip-size": size }, children, endContent),
  };
});
vi.mock("../chat-ui", () => ({
  focusAgentComposer: harness.focusAgentComposer,
}));
vi.mock("../agent-chat-store-context", () => ({
  useAgentChatUiTargets: () => ({
    composerId: "agent-composer",
    fallbackFocusId: "agent-panel-dialog",
    usageId: "agent-usage",
  }),
}));

import { AgentComposerContexts } from "../agent-composer-contexts";

const INITIAL_CONTEXTS: AgentContextAttachment[] = [
  {
    reference: { kind: "record", entityType: "contact", recordId: "contact-1" },
    label: "Ada Lovelace",
  },
  {
    reference: { kind: "record", entityType: "organization", recordId: "organization-1" },
    label: "Analytical Engines",
  },
];

function ContextHarness() {
  const [contexts, setContexts] = useState(INITIAL_CONTEXTS);
  return createElement(AgentComposerContexts, {
    contexts,
    onRemove: (key) =>
      setContexts((current) => current.filter((context) => agentContextAttachmentKey(context) !== key)),
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AgentComposerContexts", () => {
  it("renders compact inline chips and restores removal focus logically", async () => {
    act(() => root.render(createElement(ContextHarness)));

    const group = container.querySelector<HTMLElement>('[data-testid="agent-composer-contexts"]');
    expect(group?.className).toBe("contents");
    const chips = container.querySelectorAll<HTMLElement>('[data-chip-size="sm"]');
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.className).toContain("me-1.5");
      expect(chip.className).toContain("my-px");
      expect(chip.className).toContain("px-[5px]");
    }
    expect(group?.textContent).toContain("Ada Lovelace");
    expect(group?.textContent).not.toContain("Contact:");

    let removeButtons = container.querySelectorAll<HTMLButtonElement>('[data-agent-context-remove="true"]');
    await act(async () => {
      removeButtons[0]?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 1));
    });

    removeButtons = container.querySelectorAll<HTMLButtonElement>('[data-agent-context-remove="true"]');
    expect(removeButtons).toHaveLength(1);
    expect(document.activeElement).toBe(removeButtons[0]);
    expect(harness.focusAgentComposer).not.toHaveBeenCalled();

    await act(async () => {
      removeButtons[0]?.click();
      await new Promise((resolve) => window.setTimeout(resolve, 1));
    });

    expect(container.querySelector('[data-testid="agent-composer-contexts"]')).toBeNull();
    expect(harness.focusAgentComposer).toHaveBeenCalledOnce();
  });

  it("removes focused chips with Backspace and Delete while preserving logical focus", async () => {
    act(() => root.render(createElement(ContextHarness)));

    let removeButtons = container.querySelectorAll<HTMLButtonElement>('[data-agent-context-remove="true"]');
    act(() => removeButtons[1]?.focus());
    const shiftDelete = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Delete",
      shiftKey: true,
    });
    const controlBackspace = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "Backspace",
    });
    const composingBackspace = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" });
    Object.defineProperty(composingBackspace, "isComposing", { value: true });
    act(() => {
      removeButtons[1]?.dispatchEvent(shiftDelete);
      removeButtons[1]?.dispatchEvent(controlBackspace);
      removeButtons[1]?.dispatchEvent(composingBackspace);
    });
    expect(shiftDelete.defaultPrevented).toBe(false);
    expect(controlBackspace.defaultPrevented).toBe(false);
    expect(composingBackspace.defaultPrevented).toBe(false);
    expect(container.querySelectorAll('[data-agent-context-remove="true"]')).toHaveLength(2);

    const backspace = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace" });
    await act(async () => {
      removeButtons[1]?.dispatchEvent(backspace);
      await new Promise((resolve) => window.setTimeout(resolve, 1));
    });

    expect(backspace.defaultPrevented).toBe(true);
    removeButtons = container.querySelectorAll<HTMLButtonElement>('[data-agent-context-remove="true"]');
    expect(removeButtons).toHaveLength(1);
    expect(document.activeElement).toBe(removeButtons[0]);

    const deleteKey = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Delete" });
    await act(async () => {
      removeButtons[0]?.dispatchEvent(deleteKey);
      await new Promise((resolve) => window.setTimeout(resolve, 1));
    });

    expect(deleteKey.defaultPrevented).toBe(true);
    expect(container.querySelector('[data-testid="agent-composer-contexts"]')).toBeNull();
    expect(harness.focusAgentComposer).toHaveBeenCalledOnce();
  });
});
