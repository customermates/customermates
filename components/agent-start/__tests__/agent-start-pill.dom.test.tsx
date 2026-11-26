import type { ReactNode } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a className={className} href={href}>
      {children}
    </a>
  ),
}));

import { AgentStartPill, agentStartOpenLinks } from "../agent-start-pill";

const PROMPT = "Read https://customermates.com/start.md, connect Customermates and set it up for my business.";

describe("AgentStartPill", () => {
  it("links to the connect page instead of copying a prompt", () => {
    const markup = renderToStaticMarkup(<AgentStartPill href="/connect-agent" label="Onboard your agent" />);

    expect(markup).toContain('href="/connect-agent"');
    expect(markup).toContain("Onboard your agent");
    expect(markup).not.toContain("<button");
  });

  it("opens Claude and ChatGPT with the whole prompt filled in", () => {
    const links = agentStartOpenLinks(PROMPT);
    expect(new URL(links.claude).searchParams.get("q")).toBe(PROMPT);
    expect(new URL(links.chatgpt).searchParams.get("q")).toBe(PROMPT);
    expect(new URL(links.claude).origin).toBe("https://claude.ai");
    expect(new URL(links.chatgpt).origin).toBe("https://chatgpt.com");
  });
});
