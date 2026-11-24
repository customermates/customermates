import type { ReactElement } from "react";
import type { Root } from "react-dom/client";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clipboard = vi.hoisted(() => ({ copyToClipboard: vi.fn() }));
vi.mock("@/core/utils/clipboard", () => clipboard);

const sonner = vi.hoisted(() => {
  const toast = { success: vi.fn(), error: vi.fn() };
  return { toast };
});
vi.mock("sonner", () => sonner);

import { AgentStartPill, agentStartOpenLinks } from "../agent-start-pill";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROMPT = "Read https://customermates.com/start.md, connect Customermates and set it up for my business.";
const labels = {
  copied: "Copied. Paste it into your agent",
  failed: "Copy failed",
  label: "Onboard your agent",
  openInClaude: "Open in Claude",
  openInChatgpt: "Open in ChatGPT",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function click() {
  act(() => root.render(<AgentStartPill labels={labels} prompt={PROMPT} />));
  await act(async () => {
    container.querySelector("button")?.click();
    await Promise.resolve();
  });
}

describe("AgentStartPill", () => {
  it("copies the prompt, keeps its size and shows the prompt with links to open it in Claude or ChatGPT in a toast", async () => {
    clipboard.copyToClipboard.mockResolvedValue(true);

    await click();

    expect(clipboard.copyToClipboard).toHaveBeenCalledWith(PROMPT);
    expect(container.textContent).toBe(labels.label);
    expect(container.querySelector('[data-status="copied"]')).not.toBeNull();
    expect(sonner.toast.success).toHaveBeenCalledWith(
      labels.copied,
      expect.objectContaining({ id: "agent-start-copied" }),
    );
    const description = renderToStaticMarkup(sonner.toast.success.mock.calls[0][1].description as ReactElement);
    const links = agentStartOpenLinks(PROMPT);
    expect(description).toContain(PROMPT);
    expect(description).toContain(`href="${links.claude.replaceAll("&", "&amp;")}"`);
    expect(description).toContain(`href="${links.chatgpt.replaceAll("&", "&amp;")}"`);
    expect(description).toContain(labels.openInClaude);
    expect(description).toContain(labels.openInChatgpt);
    expect(sonner.toast.error).not.toHaveBeenCalled();
  });

  it("says that the copy failed in an error toast and keeps the copy icon", async () => {
    clipboard.copyToClipboard.mockResolvedValue(false);

    await click();

    expect(sonner.toast.error).toHaveBeenCalledWith(labels.failed, { id: "agent-start-copied" });
    expect(sonner.toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('[data-status="idle"]')).not.toBeNull();
  });

  it("opens Claude and ChatGPT with the whole prompt filled in", () => {
    const links = agentStartOpenLinks(PROMPT);
    expect(new URL(links.claude).searchParams.get("q")).toBe(PROMPT);
    expect(new URL(links.chatgpt).searchParams.get("q")).toBe(PROMPT);
    expect(new URL(links.claude).origin).toBe("https://claude.ai");
    expect(new URL(links.chatgpt).origin).toBe("https://chatgpt.com");
  });
});
