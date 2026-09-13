import { describe, expect, it } from "vitest";

import { SURFACE } from "@/core/data-view/data-view-keys";
import { DATA_VIEW_PATHS, ENTITY_TIMELINE_PARENT_PATHS } from "@/core/data-view/data-view-paths";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { clientSafeAgentMessageParts } from "../agent-chat.schema";
import {
  AgentVisibleTextStreamSanitizer,
  agentPlainTextPreview,
  sanitizeAgentConversationTitle,
  sanitizeAgentVisibleText,
  sanitizeAgentVisibleTextForApp,
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

  it("keeps named saved-view links on every standalone surface and supported locale", () => {
    const viewId = "00000000-0000-4000-8000-000000000001";
    for (const path of Object.values(DATA_VIEW_PATHS)) {
      if (path === null) continue;
      for (const prefix of ["", ...APP_LOCALES.map((locale) => `/${locale}`)]) {
        const url = `${prefix}${path}?view=${viewId}`;
        expect(sanitizeAgentVisibleText(url)).toBe(url);
        const answer = `Open [My view](${url}) or [${url}](${url}).`;
        expect(sanitizeAgentVisibleText(answer)).toBe(answer);
        expect(sanitizeAgentVisibleText(sanitizeAgentVisibleText(answer))).toBe(answer);
      }
    }
    expect(sanitizeAgentVisibleText(`[All](/contacts?view=__all__)`)).toBe(`[All](/contacts?view=__all__)`);
    expect(sanitizeAgentVisibleText(`[Status:Open](/contacts?view=${viewId})`)).toBe(
      `[Status:Open](/contacts?view=${viewId})`,
    );
    expect(sanitizeAgentVisibleText(`Created:[Open](/contacts?view=${viewId})`)).toBe(
      `Created:[Open](/contacts?view=${viewId})`,
    );
  });

  it("keeps named timeline links on exact record routes while redacting unrelated ids", () => {
    const recordId = "00000000-0000-4000-8000-000000000001";
    const viewId = "00000000-0000-4000-8000-000000000002";
    for (const path of ENTITY_TIMELINE_PARENT_PATHS) {
      for (const prefix of ["", ...APP_LOCALES.map((locale) => `/${locale}`)]) {
        const url = `${prefix}${path}/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
        const answer = `Open [Activity](${url}); raw ${recordId}.`;
        expect(sanitizeAgentVisibleText(answer)).toBe(`Open [Activity](${url}); raw [internal reference].`);
      }
    }
  });

  it("keeps saved-view URLs only within exact local page links", () => {
    const viewId = "00000000-0000-4000-8000-000000000001";
    const recordId = "00000000-0000-4000-8000-000000000002";
    const rejected = [
      `https://example.com/contacts?view=${viewId}`,
      `//example.com/contacts?view=${viewId}`,
      `/unknown?view=${viewId}`,
      `/xx/contacts?view=${viewId}`,
      `/CONTACTS?view=${viewId}`,
      `/contacts?record=${viewId}`,
      `/contacts?view=${viewId}&searchTerm=secret`,
      `/contacts?searchTerm=secret&view=${viewId}`,
      `/contacts?view=${viewId}#details`,
      `/contacts?view=${viewId}/details`,
      `/contacts?view=${viewId}%20`,
      `/contacts?view=${viewId}x`,
      `https://example.invalid/(/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})`,
      `https://example.invalid/x](/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})`,
      `//example.invalid/x](/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})`,
    ];
    for (const url of rejected) expect(sanitizeAgentVisibleText(`[View](${url})`)).not.toContain(viewId);
    const valid = `/contacts?view=${viewId}`;
    expect(sanitizeAgentVisibleText(`Raw ${viewId}; [View](${valid}).`)).toBe(
      `Raw [internal reference]; [View](${valid}).`,
    );
    const disguisedExternalLinks = [
      `https://example.invalid/x](/contacts/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})`,
      `[Link](https://example.invalid/x\\)](/contacts/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))`,
    ];
    for (const source of disguisedExternalLinks) {
      expect(sanitizeAgentVisibleText(source)).not.toContain(viewId);
      expect(sanitizeAgentVisibleText(source)).not.toContain(recordId);
    }
    const timelineUrl = `/contacts/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
    for (const source of [
      `[Link](https://example.invalid "${timelineUrl}")`,
      `![Image](https://example.invalid "${timelineUrl}")`,
      `[Link](<https://example.invalid ${timelineUrl}>)`,
      `<a href="https://example.invalid/x ${timelineUrl}">Link</a>`,
      `[Link][ref]\n\n[ref]: https://example.invalid\n  "${timelineUrl}"\n`,
      `> [Link][ref]\n>\n> [ref]: https://example.invalid\n>   "${timelineUrl}"\n`,
      `- [Link][ref]\n\n  [ref]: https://example.invalid\n    "${timelineUrl}"\n`,
    ]) {
      expect(sanitizeAgentVisibleText(source)).not.toContain(viewId);
      expect(sanitizeAgentVisibleText(source)).not.toContain(recordId);
    }
    expect(sanitizeAgentVisibleText(`[View](\\/contacts\\?view\\=${viewId})`)).toContain(viewId);
    expect(sanitizeAgentVisibleText("/contacts?view=00000000-0000-4")).toBe("/contacts?view=[internal reference]");
  });

  it("redacts secret assignments and private content even when they contain a saved-view URL", () => {
    const url = "/contacts?view=00000000-0000-4000-8000-000000000001";
    expect(sanitizeAgentVisibleText(`password=${url}; Safe.`)).toBe("password=[redacted]; Safe.");
    expect(sanitizeAgentVisibleText(`password=[View](${url}); Safe.`)).not.toContain("00000000");
    expect(sanitizeAgentVisibleText(`<analysis>[View](${url})</analysis>Safe.`)).toBe("Safe.");
  });

  it("classifies saved-view URLs before other redactions alter their Markdown context", () => {
    const recordId = "00000000-0000-4000-8000-000000000001";
    const viewId = "00000000-0000-4000-8000-000000000002";
    const timelineUrl = `/contacts/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
    const externalTitle = `[Link](https://example.invalid "${timelineUrl} Authorization: Bearer abc")`;
    const validLink = `[Activity](${timelineUrl})`;

    expect(sanitizeAgentVisibleText(externalTitle)).not.toContain(recordId);
    expect(sanitizeAgentVisibleText(externalTitle)).not.toContain(viewId);
    expect(sanitizeAgentVisibleText(`${validLink}\nAuthorization: Bearer abc`)).toContain(validLink);
  });

  it("canonicalizes same-app absolute links across every provider chunk boundary", () => {
    const origin = "http://localhost:4016";
    const recordId = "00000000-0000-4000-8000-000000000001";
    const viewId = "00000000-0000-4000-8000-000000000002";
    const relativeUrl = `/contacts/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
    const source = `Created [Activity timeline](${origin}/en${relativeUrl}).`;
    const expected = `Created [Activity timeline](${relativeUrl}).`;

    expect(sanitizeAgentVisibleTextForApp(source, origin)).toBe(expected);
    expect(sanitizeAgentVisibleTextForApp(source, "https://app.example.com")).not.toContain(viewId);
    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer(origin);
      const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
      expect(visible, `split ${split}`).toBe(expected);
    }
  });

  it("preserves whole saved-view URLs across every provider chunk boundary and incremental streaming", () => {
    const viewId = "00000000-0000-4000-8000-000000000001";
    const url = `/de/company/webhook-deliveries?view=${viewId}`;
    const timelineUrl = `/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
    const longTitle = "padding ".repeat(65);
    const prefix = "A safe introduction. ".repeat(8);
    const suffix = " A safe conclusion.".repeat(8);
    const sources = [
      `${prefix}[My view](${url})${suffix}`,
      `${prefix}[Status:Open](${url})${suffix}`,
      `${prefix}Created:[Open](${url})${suffix}`,
      `${prefix}[Activity](/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})${suffix}`,
      `${prefix}[${url}](${url})${suffix}`,
      `${prefix}[View](${url}&extra=value)${suffix}`,
      `${prefix}https://example.com${url}${suffix}`,
      `${prefix}https://${"x".repeat(400)}.example.com${url}${suffix}`,
      `${prefix}[External](https://example.invalid/(/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))${suffix}`,
      `${prefix}[External](https://${"x".repeat(400)}.example.invalid/x](/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))${suffix}`,
      `${prefix}[External](//${"x".repeat(400)}.example.invalid/x](/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))${suffix}`,
      `${prefix}https://example.invalid/x](/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})${suffix}`,
      `${prefix}[External](https://example.invalid/x\\)](/contacts/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))${suffix}`,
      `${prefix}[External](https://example.invalid "${timelineUrl} ${longTitle}")${suffix}`,
      `${prefix}*[External](https://example.invalid "${timelineUrl} ${longTitle}")*${suffix}`,
      `${prefix}![External](https://example.invalid "${timelineUrl} ${longTitle}")${suffix}`,
      `${prefix}[External](<https://example.invalid ${timelineUrl}> "${longTitle}")${suffix}`,
      `${prefix}[View](${url} "${longTitle}")${suffix}`,
      `${prefix}*[View](${url} "${longTitle}")*${suffix}`,
      `${prefix}[View](\\/de/company/webhook-deliveries\\?view\\=${viewId} "${longTitle}")${suffix}`,
      `${prefix}[Link][ref]\n\n[ref]: https://example.invalid\n  "${timelineUrl} ${longTitle}"\n${suffix}`,
      `${prefix}\n> [Link][ref]\n>\n> [ref]: https://example.invalid\n>   "${timelineUrl} ${longTitle}"\n${suffix}`,
      `${prefix}\n- [Link][ref]\n\n  [ref]: https://example.invalid\n    "${timelineUrl} ${longTitle}"\n${suffix}`,
      `Here is the view\n    [View](${timelineUrl})\n    ${longTitle}\n`,
      `${prefix}\`${longTitle}[View](${url}) ${longTitle}\`${suffix}`,
      `${prefix}\n~~~text\n${longTitle}\n[View](${url})\n${longTitle}\n~~~\n${suffix}`,
      `${prefix}\n\n    ${longTitle}[View](${url}) ${longTitle}\n${suffix}`,
      `${prefix}\n<!-- ${longTitle}[View](${url}) ${longTitle} -->\n${suffix}`,
      `${prefix}\n<div>\n${longTitle}[View](${url}) ${longTitle}\n</div>\n\n${suffix}`,
      `${prefix}<span title="${longTitle}[View](${url}) ${longTitle}">Text</span>${suffix}`,
      `${prefix}<a href="https://example.invalid/x ${timelineUrl}">Link</a>${suffix}`,
      `${prefix}[External](https://example.invalid "${timelineUrl} Authorization: Bearer abc")${suffix}`,
      `${prefix}\\[View](${url})${suffix}`,
      `${prefix}${url}${suffix} Raw ${viewId}.`,
    ];
    for (const [sourceIndex, source] of sources.entries()) {
      const expected = sanitizeAgentVisibleText(source);
      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer();
        const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
        expect(visible, `source ${sourceIndex}, split ${split}`).toBe(expected);
      }
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      const visible = [...source].map((character) => sanitizer.push(character)).join("") + sanitizer.finish();
      expect(visible).toBe(expected);
    }
  }, 120_000);

  it("preserves saved-view links when replaying persisted messages", () => {
    const text = "Open [My view](/contacts?view=00000000-0000-4000-8000-000000000001).";
    const parts = [{ type: "text", text }];
    expect(clientSafeAgentMessageParts(parts, { sanitizeText: true })).toEqual(parts);
  });

  it("removes provider tool protocol and its payload across every chunk boundary", () => {
    const source = [
      "I prepared the first batch.",
      " to=customer_records.create_contacts  (json)",
      '\n{"contacts":[{"email":"private@example.com","apiKey":"never-show"}]}',
    ].join("");
    const expected = "I prepared the first batch.";

    expect(sanitizeAgentVisibleText(source)).toBe(expected);

    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
      expect(visible).toBe(expected);
      expect(sanitizer.removedToolProtocol).toBe(true);
    }
  });

  it("keeps ordinary recipient and prose lines that only share a protocol prefix", () => {
    const values = [
      "to=finance@example.com",
      "to=customer",
      "Send the report to=customer when it is ready.",
      "Send the report to=customer.records when it is ready.",
    ];

    for (const source of values) {
      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer();
        const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
        expect(visible).toBe(source);
        expect(sanitizer.removedToolProtocol).toBe(false);
      }
    }
  });

  it("fails closed for incomplete private tails", () => {
    expect(sanitizeAgentVisibleText("Safe answer. <analysis>private reasoning")).toBe("Safe answer. ");
    expect(sanitizeAgentVisibleText('Safe answer. <page_context route="/private')).toBe("Safe answer. ");
    expect(sanitizeAgentVisibleText("Safe answer. 00000000-0000-4")).toBe("Safe answer. [internal reference]");
    expect(sanitizeAgentVisibleText("Safe answer. apiKey='never-show")).not.toContain("never-show");

    const sanitizer = new AgentVisibleTextStreamSanitizer();
    expect(`${sanitizer.push("Safe answer. <think>private")}${sanitizer.finish()}`).toBe("Safe answer. ");

    const protocol = new AgentVisibleTextStreamSanitizer();
    expect(`${protocol.push("Safe answer.\nassistant to=customer_")}${protocol.finish()}`).toBe(
      "Safe answer.\nassistant to=customer_",
    );
    expect(protocol.removedToolProtocol).toBe(false);
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
          type: "activity",
          id: "legacy-interface-activity",
          activity: {
            kind: "interface.configure",
            affectedResources: [],
            risk: "write",
          },
          status: "done",
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
        {
          type: "tool_use",
          id: "legacy-configure-view",
          name: "configure_view",
          input: { page: "contacts", layout: "cards" },
          status: "done",
        },
        { type: "reasoning", text: "hidden chain of thought" },
        { type: "tool_result", result: { apiKey: "never-show" } },
        {
          type: "provider_metadata",
          modelId: "gpt-5.6-luna",
          inputTokens: 321,
        },
      ],
      { sanitizeText: true },
    );
    const serialized = JSON.stringify(parts);

    expect(parts.map((part) => part.type)).toEqual(["text", "activity", "activity", "activity", "activity"]);
    expect(serialized).toContain("records.read");
    expect(serialized).toContain("messages.send");
    expect(serialized).toContain("interface.interact");
    expect(serialized).not.toContain("interface.configure");
    expect(serialized).not.toContain("configure_view");
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
