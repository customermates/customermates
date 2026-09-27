// @vitest-environment jsdom

import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { AgentTourNote } from "@/app/components/agent-chat/agent-tour-overlay";

const EMAILS_NOTE = "Enter the email addresses of the teammates you want to invite.";
const SEND_NOTE = "Click Send invitations to dispatch the real invitation emails.";

let container: HTMLDivElement;
let reactRoot: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
});

describe("AgentTourNote between tour stops", () => {
  it("shows the next stop's note when it has the same length as the previous one", () => {
    expect(SEND_NOTE).toHaveLength(EMAILS_NOTE.length);

    act(() => reactRoot.render(createElement(AgentTourNote, { note: EMAILS_NOTE })));
    expect(container.textContent).toBe(EMAILS_NOTE);

    act(() => reactRoot.render(createElement(AgentTourNote, { note: SEND_NOTE })));

    expect(container.textContent).toBe(SEND_NOTE);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
