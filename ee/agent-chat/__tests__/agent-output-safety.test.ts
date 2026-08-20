import { describe, expect, it } from "vitest";

import { clientSafeAgentMessageParts } from "../agent-chat.schema";
import {
  AgentVisibleTextStreamSanitizer,
  agentPlainTextPreview,
  sanitizeAgentConversationTitle,
  sanitizeAgentVisibleText,
} from "../agent-output-safety";

describe("agent client-visible output safety", () => {
  it("redacts private model output without removing the user-facing answer", () => {
    const secret = `sk-proj-${"x".repeat(120)}`;
    const source = [
      "I finished the import. ",
      `<analysis>Hidden chain of thought with password=never-show.</analysis>`,
      '<page_context route="/en/contacts"/>',
      "&lt;page_context route=&quot;/en/deals&quot;/&gt;",
      " Reference 00000000-0000-9000-c000-000000000001.",
      ` apiKey=${secret};`,
      " Authorization: Bearer private-token\n",
      " modelId=gpt-5.6-luna; inputTokens=321; internal model cost=$0.004.",
      " The safe summary is ready.",
    ].join("");

    const visible = sanitizeAgentVisibleText(source);

    expect(visible).toContain("I finished the import.");
    expect(visible).toContain("The safe summary is ready.");
    expect(visible).toContain("[internal reference]");
    expect(visible).not.toMatch(/never-show|page_context|private-token|sk-proj|gpt-5\.6|inputTokens|321|\$0\.004/i);
    expect(sanitizeAgentVisibleText("Authorization: Required for workspace admins.")).toBe(
      "Authorization: Required for workspace admins.",
    );
  });

  it("produces the same safe text across every provider chunk boundary", () => {
    const source = [
      "Before ",
      `<reasoning>${"private reasoning ".repeat(8)}</reasoning>`,
      "apiKey=sk-proj-abcdefghijklmnopqrstuvwxyz0123456789; ",
      "00000000-0000-4000-8000-000000000001 after.",
    ].join("");
    const expected = sanitizeAgentVisibleText(source);

    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
      expect(visible).toBe(expected);
    }
  });

  it("fails closed for incomplete private tails", () => {
    expect(sanitizeAgentVisibleText("Safe answer. <analysis>private reasoning")).toBe("Safe answer. ");
    expect(sanitizeAgentVisibleText('Safe answer. <page_context route="/private')).toBe("Safe answer. ");
    expect(sanitizeAgentVisibleText("Safe answer. 00000000-0000-4")).toBe("Safe answer. [internal reference]");
    expect(sanitizeAgentVisibleText("Safe answer. apiKey='never-show")).not.toContain("never-show");

    const sanitizer = new AgentVisibleTextStreamSanitizer();
    expect(`${sanitizer.push("Safe answer. <think>private")}${sanitizer.finish()}`).toBe("Safe answer. ");
  });

  it("keeps already-sanitized text stable", () => {
    const once = sanitizeAgentVisibleText("Done. apiKey=never-show; 00000000-0000-4000-8000-000000000001");

    expect(sanitizeAgentVisibleText(once)).toBe(once);
  });

  it("converts persisted legacy parts through a semantic allowlist", () => {
    const privateId = "00000000-0000-4000-8000-000000000001";
    const parts = clientSafeAgentMessageParts(
      [
        {
          type: "text",
          text: `<page_context route="/private"/>Done with ${privateId}; apiKey=never-show.`,
        },
        {
          type: "activity",
          id: "activity-1",
          activity: {
            kind: "records.read",
            resource: "contacts",
            affectedResources: ["contacts"],
            risk: "read",
            rawArguments: { apiKey: "never-show" },
          },
          status: "done",
          rawResult: "never-show",
        },
        {
          type: "tool_use",
          id: "legacy-tool-1",
          name: "send_email",
          input: {
            to: [{ display_name: "Ada", identifier: "ada@example.com" }],
            subject: "Update",
            body: "apiKey=never-show",
            rawId: privateId,
          },
          resultPreview: "never-show",
        },
        { type: "reasoning", text: "hidden chain of thought" },
        { type: "tool_result", result: { apiKey: "never-show" } },
        { type: "provider_metadata", modelId: "gpt-5.6-luna", inputTokens: 321 },
      ],
      { sanitizeText: true },
    );
    const serialized = JSON.stringify(parts);

    expect(parts.map((part) => part.type)).toEqual(["text", "activity", "activity"]);
    expect(serialized).toContain("records.read");
    expect(serialized).toContain("messages.send");
    expect(serialized).not.toMatch(
      /page_context|00000000|never-show|rawArguments|rawResult|resultPreview|reasoning|tool_result|provider_metadata|gpt-5\.6|321/,
    );
  });

  it("sanitizes and bounds titles while removing legacy route envelopes", () => {
    const title = sanitizeAgentConversationTitle(
      `\uFEFF <page_context route="/en/dashboard"/>\nLaunch ${"x".repeat(100)} apiKey=never-show`,
    );

    expect(title).toHaveLength(80);
    expect(title).toMatch(/^Launch /);
    expect(title).not.toMatch(/page_context|never-show/);
    expect(sanitizeAgentConversationTitle('<page_context route="/private"/>')).toBeNull();
  });
});

describe("agent conversation preview", () => {
  it("reads a formatted answer as plain prose", () => {
    const preview = agentPlainTextPreview(
      [
        "I checked the data in sequence:",
        "",
        "1. **Organization with the highest total deal value:** **Continental**",
        "    **€560,500 total** across two Deals",
        "- Data Center Refresh — €418,500",
      ].join("\n"),
      140,
    );

    expect(preview).toBe(
      "I checked the data in sequence: Organization with the highest total deal value: Continental €560,500 total across two Deals Data Center Refr",
    );
    expect(preview).not.toContain("*");
  });

  it("keeps link and code text while dropping their syntax", () => {
    expect(agentPlainTextPreview("See [the deals page](/en/deals) and run `yarn dev` now.", 140)).toBe(
      "See the deals page and run yarn dev now.",
    );
    expect(agentPlainTextPreview("## Heading\n> quoted line\n~~dropped~~ kept", 140)).toBe(
      "Heading quoted line dropped kept",
    );
  });

  it("leaves ordinary punctuation and identifiers untouched", () => {
    expect(agentPlainTextPreview("Rate is 3 * 4 and first_name stays intact.", 140)).toBe(
      "Rate is 3 * 4 and first_name stays intact.",
    );
    expect(agentPlainTextPreview("Total: €1,200 (up 5%) — nothing to strip.", 140)).toBe(
      "Total: €1,200 (up 5%) — nothing to strip.",
    );
  });

  it("still bounds the preview length", () => {
    expect(agentPlainTextPreview(`**${"a".repeat(400)}**`, 140)).toHaveLength(140);
  });
});
