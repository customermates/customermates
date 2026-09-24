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
      endContent,
      size,
      startContent,
    }: {
      children?: ReactNode;
      endContent?: ReactNode;
      size?: string;
      startContent?: ReactNode;
    }) => React.createElement("span", { "data-chip-size": size }, startContent, children, endContent),
  };
});
vi.mock("@/components/entity-detail/entity-relations", () => ({
  ENTITY_ICON: {
    contact: () => null,
    organization: () => null,
  },
}));
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
    label: "Contact: Ada Lovelace",
  },
  {
    reference: { kind: "record", entityType: "organization", recordId: "organization-1" },
    label: "Organization: Analytical Engines",
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
    expect(container.querySelectorAll('[data-chip-size="sm"]')).toHaveLength(2);

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
});
