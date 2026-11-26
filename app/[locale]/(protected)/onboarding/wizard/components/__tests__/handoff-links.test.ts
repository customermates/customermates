import { describe, expect, it } from "vitest";

import { agentLaunchUrl } from "../agent-launch-url";
import { mailInboxFor } from "../mail-inbox-link";

describe("agentLaunchUrl", () => {
  const prompt = "Set up my Customermates workspace Acme & Co.";

  it("opens a new Claude chat with the request prefilled", () => {
    expect(agentLaunchUrl("claude", null, prompt)).toBe(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`);
  });

  it("opens ChatGPT unless the owner connected Codex", () => {
    expect(agentLaunchUrl("openai", "chatgpt", prompt)).toBe(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`);
    expect(agentLaunchUrl("openai", null, prompt)).toBe(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`);
    expect(agentLaunchUrl("openai", "codex", prompt)).toBeNull();
  });

  it("has no link for agents without a web chat to prefill", () => {
    expect(agentLaunchUrl("cursor", null, prompt)).toBeNull();
    expect(agentLaunchUrl("gemini", null, prompt)).toBeNull();
    expect(agentLaunchUrl(null, null, prompt)).toBeNull();
  });
});

describe("mailInboxFor", () => {
  it("knows the common webmail inboxes regardless of case", () => {
    expect(mailInboxFor("anna@gmail.com")).toEqual({ name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox" });
    expect(mailInboxFor("Anna@GoogleMail.com")?.name).toBe("Gmail");
    expect(mailInboxFor("anna@hotmail.de")?.name).toBe("Outlook");
    expect(mailInboxFor("anna@gmx.net")?.name).toBe("GMX");
    expect(mailInboxFor("anna@web.de")?.name).toBe("WEB.DE");
  });

  it("offers no inbox link for a company domain", () => {
    expect(mailInboxFor("anna@acme.de")).toBeNull();
  });
});
