import { describe, expect, it } from "vitest";

import { SURFACE } from "@/core/data-view/data-view-keys";
import {
  AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS,
  OPERATOR_DATA_VIEW_SURFACE_KEYS,
} from "@/core/data-view/ai-manageable-surfaces";
import { DATA_VIEW_PATHS } from "@/core/data-view/data-view-paths";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { clientSafeAgentMessageParts } from "../agent-chat.schema";
import {
  AgentVisibleTextStreamSanitizer,
  agentPlainTextPreview,
  sanitizeAgentConversationTitle,
  sanitizeAgentPlainText,
  sanitizeAgentVisibleText,
  sanitizeAgentVisibleTextForApp,
} from "../agent-output-safety";

const SAVED_VIEW_STREAMING_CASES = (() => {
  const viewId = "00000000-0000-4000-8000-000000000001";
  const url = `/de/settings/webhooks/deliveries?view=${viewId}`;
  const timelineUrl = `/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
  const longTitle = "padding ".repeat(65);
  const prefix = "A safe introduction. ".repeat(8);
  const suffix = " A safe conclusion.".repeat(8);
  return [
    `${prefix}[My view](${url})${suffix}`,
    `${prefix}[Status:Open](${url})${suffix}`,
    `${prefix}Created:[Open](${url})${suffix}`,
    `${prefix}[Activity](/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})${suffix}`,
    `${prefix}[${url}](${url})${suffix}`,
    `${prefix}[View](${url}&extra=value)${suffix}`,
    `${prefix}https://example.com${url}${suffix}`,
    `${prefix}https://${"x".repeat(400)}.example.com${url}${suffix}`,
    `${prefix}[External](https://example.invalid/(/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))${suffix}`,
    `${prefix}[External](https://${"x".repeat(400)}.example.invalid/x](/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))${suffix}`,
    `${prefix}[External](//${"x".repeat(400)}.example.invalid/x](/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))${suffix}`,
    `${prefix}https://example.invalid/x](/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})${suffix}`,
    `${prefix}[External](https://example.invalid/x\\)](/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))${suffix}`,
    `${prefix}[External](https://example.invalid "${timelineUrl} ${longTitle}")${suffix}`,
    `${prefix}*[External](https://example.invalid "${timelineUrl} ${longTitle}")*${suffix}`,
    `${prefix}![External](https://example.invalid "${timelineUrl} ${longTitle}")${suffix}`,
    `${prefix}[External](<https://example.invalid ${timelineUrl}> "${longTitle}")${suffix}`,
    `${prefix}[View](${url} "${longTitle}")${suffix}`,
    `${prefix}*[View](${url} "${longTitle}")*${suffix}`,
    `${prefix}[View](\\/de/settings/webhooks/deliveries\\?view\\=${viewId} "${longTitle}")${suffix}`,
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
})();

describe("agent client-visible output safety", () => {
  const wikiBaseUrl = "https://app.customermates.com";

  it("preserves local Wiki citations across every stream split while redacting bare identifiers", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const source = `Read [Voice](/wiki?page=${id}) and [Support](/de/wiki?page=${id}). Bare ${id}. ${"Safe prose. ".repeat(10)} [/wiki?page=${id}](/wiki?page=${id}) Raw /wiki?page=${id} and \`/wiki?page=${id}\``;
    const expected = source.replace(`Bare ${id}`, "Bare [internal reference]");
    expect(sanitizeAgentVisibleText(source)).toBe(expected);
    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      expect(
        `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`,
      ).toBe(expected);
    }
    const sanitizer = new AgentVisibleTextStreamSanitizer();
    expect([...source].map((character) => sanitizer.push(character)).join("") + sanitizer.finish()).toBe(expected);
    expect(
      clientSafeAgentMessageParts([{ type: "text", text: source }], {
        sanitizeText: true,
      }),
    ).toEqual([{ type: "text", text: expected }]);
  });

  it.each([
    `/wiki?page=00000000-0000-4000-8000-000000000001`,
    `/de/wiki?page=00000000-0000-4000-8000-000000000001`,
    `${wikiBaseUrl}/wiki?page=00000000-0000-4000-8000-000000000001`,
    `${wikiBaseUrl}/de/wiki?page=00000000-0000-4000-8000-000000000001`,
  ])("preserves the canonical Wiki citation %s across every stream split", (path) => {
    const source = `Read [Page](${path}).`;
    expect(sanitizeAgentVisibleText(source, wikiBaseUrl)).toBe(source);
    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer(wikiBaseUrl);
      expect(
        `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`,
      ).toBe(source);
    }
  });

  it("normalizes a provider-added to: prefix on otherwise canonical Wiki links", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const source = `Created [Company Overview](to:/wiki?page=${id}).`;
    const expected = `Created [Company Overview](/wiki?page=${id}).`;

    expect(sanitizeAgentVisibleText(source, wikiBaseUrl)).toBe(expected);
    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer(wikiBaseUrl);
      expect(
        `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`,
      ).toBe(expected);
    }
    const sanitizer = new AgentVisibleTextStreamSanitizer(wikiBaseUrl);
    expect([...source].map((character) => sanitizer.push(character)).join("") + sanitizer.finish()).toBe(expected);
  });

  it("does not normalize a to: prefix on noncanonical Wiki links", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    for (const href of [
      `to:/wiki?page=${id}&other=true`,
      `to:https://example.com/wiki?page=${id}`,
      `to:/pt/wiki?page=${id}`,
    ]) {
      const result = sanitizeAgentVisibleText(`[Page](${href})`, wikiBaseUrl);
      expect(result).toBe("Page");
      expect(result).not.toContain(id);
    }
  });

  it("does not exempt external, noncanonical, or incomplete Wiki citations from ID redaction", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    for (const [path, identifier] of [
      [`https://example.com/wiki?page=${id}`, id],
      [`https://例子.公司/wiki?page=${id}`, id],
      [`https://example.com/path)/wiki?page=${id}`, id],
      [`/other-/wiki?page=${id}`, id],
      [`//example.com/wiki?page=${id}`, id],
      [`/pt/wiki?page=${id}`, id],
      [`/settings/webhooks?id=${id}`, id],
      [`/wiki?page=${id}&other=true`, id],
      [`/wiki?page=${id}#fragment`, id],
      [`/WIKI?page=${id}`, id],
      [`/wiki?PAGE=${id}`, id],
      [`/EN/wiki?page=${id}`, id],
      ["/wiki?page=10000000-0000-9000-8000-000000000001", "10000000-0000-9000-8000-000000000001"],
      ["/wiki?page=10000000-0000-4000-c000-000000000001", "10000000-0000-4000-c000-000000000001"],
    ]) {
      expect(sanitizeAgentVisibleText(`[Link](${path})`, wikiBaseUrl)).not.toContain(identifier);
      const source = `${path}${" ".repeat(64 - `/wiki?page=${id}`.length)}`;
      const expected = sanitizeAgentVisibleText(source, wikiBaseUrl);
      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer(wikiBaseUrl);
        expect(
          `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`,
        ).toBe(expected);
      }
      const sanitizer = new AgentVisibleTextStreamSanitizer(wikiBaseUrl);
      expect([...source].map((character) => sanitizer.push(character)).join("") + sanitizer.finish()).toBe(expected);
    }

    expect(sanitizeAgentVisibleText("[Link](/wiki?page=00000000-0000-4")).toContain("[internal reference]");
  });

  it("preserves ordinary code delimiters without exposing incomplete private fences", () => {
    expect(sanitizeAgentVisibleText("Use `plain text`")).toBe("Use `plain text`");
    expect(sanitizeAgentVisibleText("```text\nPlain text\n```")).toBe("```text\nPlain text\n```");
    expect(new AgentVisibleTextStreamSanitizer().push("Safe ```analys")).not.toContain("```");
    expect(sanitizeAgentVisibleText("Safe ```analys")).toBe("Safe ```analys");
    expect(sanitizeAgentVisibleText("Safe ```analysis\nprivate")).toBe("Safe ");
  });

  it("redacts private model output without removing the user-facing answer", () => {
    const secret = `sk-proj-${"x".repeat(120)}`;
    const source = [
      "I finished the import. ",
      `<analysis>Hidden chain of thought with password=never-show.</analysis>`,
      '<page_context route="/en/records/50000000-0000-4000-8000-000000000001"/>',
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

  it("keeps a Markdown-emphasized field label intact while still redacting emphasized values", () => {
    const boldSecretLabel = "- **Secret:** Optional shared secret used to sign outgoing requests.";
    const boldApiKeyLabel = "- **API key:** Created under My Profile › API keys.";
    const italicPasswordLabel = "*Password:* At least eight characters.";

    expect(sanitizeAgentVisibleText(boldSecretLabel)).toBe(boldSecretLabel);
    expect(sanitizeAgentVisibleText(boldApiKeyLabel)).toBe(boldApiKeyLabel);
    expect(sanitizeAgentVisibleText(italicPasswordLabel)).toBe(italicPasswordLabel);
    expect(sanitizeAgentVisibleText("Secret: **hunter2**")).toBe("Secret: [redacted]");
    expect(sanitizeAgentVisibleText("secret: s3cr3tValue123")).toBe("secret: [redacted]");
    expect(sanitizeAgentVisibleText("password=[redacted]; Safe.")).toBe("password=[redacted]; Safe.");
  });

  it("still hides a Markdown-emphasized internal metadata label", () => {
    for (const source of [
      "**Input tokens:** 1234",
      "**Cost microcents:** 4200",
      "**Internal cost:** 0.03",
      "**Provider id:** vertex-ai",
    ]) {
      const visible = sanitizeAgentVisibleText(source);
      expect(visible).toContain("[internal details]");
      expect(visible).not.toMatch(/input tokens|cost microcents|internal cost|provider id/i);
    }
  });

  it("keeps a Markdown-emphasized field label intact across every provider chunk boundary", () => {
    const source = "- **Secret:** Optional shared secret used to sign outgoing requests.\nSecret: **hunter2** done.";
    const expected = "- **Secret:** Optional shared secret used to sign outgoing requests.\nSecret: [redacted] done.";

    expect(sanitizeAgentVisibleText(source)).toBe(expected);
    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
      expect(visible).toBe(expected);
    }
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

  it("renders model-authored saved-view link labels as inert text on every standalone surface and locale", () => {
    const viewId = "00000000-0000-4000-8000-000000000001";
    for (const surfaceKey of AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS) {
      const path = DATA_VIEW_PATHS[surfaceKey];
      if (path === null) continue;
      for (const prefix of ["", ...APP_LOCALES.map((locale) => `/${locale}`)]) {
        const url = `${prefix}${path}?view=${viewId}`;
        const redactedUrl = url.replace(viewId, "[internal reference]");
        expect(sanitizeAgentVisibleText(url)).toBe(redactedUrl);
        const answer = `Open [My view](${url}) or [${url}](${url}).`;
        const expected = `Open My view or ${redactedUrl}.`;
        expect(sanitizeAgentVisibleText(answer)).toBe(expected);
        expect(sanitizeAgentVisibleText(sanitizeAgentVisibleText(answer))).toBe(expected);
      }
    }
    expect(sanitizeAgentVisibleText(`[All](/settings/webhooks?view=__all__)`)).toBe("All");
    expect(sanitizeAgentVisibleText(`[Status:Open](/settings/webhooks?view=${viewId})`)).toBe("Status:Open");
    expect(sanitizeAgentVisibleText(`Created:[Open](/settings/webhooks?view=${viewId})`)).toBe("Created:Open");
    expect(sanitizeAgentVisibleText(`You can view [Contacts with Deals](/settings/webhooks?view=${viewId}).`)).toBe(
      "You can view Contacts with Deals.",
    );
    expect(
      sanitizeAgentVisibleText(
        `[**Contacts** \`with deals\`](/settings/webhooks?view=${viewId}) [![Contacts icon](https://example.com/icon.png)](/settings/webhooks?view=${viewId})`,
      ),
    ).toBe("Contacts with deals Contacts icon");
    expect(sanitizeAgentVisibleText(`[&lt;scr&lt;script&gt;ipt&gt;](/settings/webhooks?view=${viewId})`)).toBe(
      "scrscriptipt",
    );
    for (const surfaceKey of OPERATOR_DATA_VIEW_SURFACE_KEYS) {
      const path = DATA_VIEW_PATHS[surfaceKey];
      expect(path).not.toBeNull();
      expect(sanitizeAgentVisibleText(`[Operator](${path}?view=${viewId})`)).not.toContain(viewId);
    }
  });

  it("renders model-authored timeline link labels as inert text and redacts other UUIDs", () => {
    const recordId = "00000000-0000-4000-8000-000000000001";
    const viewId = "00000000-0000-4000-8000-000000000002";
    for (const path of ["/records/50000000-0000-4000-8000-000000000001"]) {
      for (const prefix of ["", ...APP_LOCALES.map((locale) => `/${locale}`)]) {
        const url = `${prefix}${path}/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
        const answer = `Open [Activity](${url}); raw ${recordId}.`;
        expect(sanitizeAgentVisibleText(answer)).toBe("Open Activity; raw [internal reference].");
      }
    }
  });

  it("neutralizes bare, autolink, and reference-style All-view destinations", () => {
    const origin = "http://localhost:4016";
    const cases = [
      ["/settings/webhooks?view=__all__", "/settings/webhooks?view=[internal reference]", undefined],
      [`<${origin}/en/settings/webhooks?view=__all__>`, "/settings/webhooks?view=[internal reference]", origin],
      ["[All][v]\n\n[v]: /settings/webhooks?view=__all__", "All\n\n", undefined],
    ] as const;

    for (const [source, expected, appBaseUrl] of cases) {
      expect(appBaseUrl ? sanitizeAgentVisibleTextForApp(source, appBaseUrl) : sanitizeAgentVisibleText(source)).toBe(
        expected,
      );
      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer(appBaseUrl);
        const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
        expect(visible, `source ${source}, split ${split}`).toBe(expected);
      }
    }
  });

  it("redacts UUIDs from exact and malformed local saved-view links", () => {
    const viewId = "00000000-0000-4000-8000-000000000001";
    const recordId = "00000000-0000-4000-8000-000000000002";
    const rejected = [
      `https://example.com/settings/webhooks?view=${viewId}`,
      `//example.com/settings/webhooks?view=${viewId}`,
      `/unknown?view=${viewId}`,
      `/xx/settings/webhooks?view=${viewId}`,
      `/CONTACTS?view=${viewId}`,
      `/settings/webhooks?record=${viewId}`,
      `/settings/webhooks?view=${viewId}&searchTerm=secret`,
      `/settings/webhooks?searchTerm=secret&view=${viewId}`,
      `/settings/webhooks?view=${viewId}#details`,
      `/settings/webhooks?view=${viewId}/details`,
      `/settings/webhooks?view=${viewId}%20`,
      `/settings/webhooks?view=${viewId}x`,
      `https://example.invalid/(/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})`,
      `https://example.invalid/x](/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})`,
      `//example.invalid/x](/records/50000000-0000-4000-8000-000000000001/${viewId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})`,
    ];
    for (const url of rejected) expect(sanitizeAgentVisibleText(`[View](${url})`)).not.toContain(viewId);
    const valid = `/settings/webhooks?view=${viewId}`;
    expect(sanitizeAgentVisibleText(`Raw ${viewId}; [View](${valid}).`)).toBe("Raw [internal reference]; View.");
    expect(sanitizeAgentVisibleText(`[External](https://example.com${valid})`)).toBe("External");
    expect(sanitizeAgentVisibleText(`[Inexact](${valid}&searchTerm=secret)`)).toBe("Inexact");
    const disguisedExternalLinks = [
      `https://example.invalid/x](/records/50000000-0000-4000-8000-000000000001/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline})`,
      `[Link](https://example.invalid/x\\)](/records/50000000-0000-4000-8000-000000000001/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}))`,
    ];
    for (const source of disguisedExternalLinks) {
      expect(sanitizeAgentVisibleText(source)).not.toContain(viewId);
      expect(sanitizeAgentVisibleText(source)).not.toContain(recordId);
    }
    const timelineUrl = `/records/50000000-0000-4000-8000-000000000001/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
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
    expect(
      sanitizeAgentVisibleText(`[View](\\/records/50000000-0000-4000-8000-000000000001\\?view\\=${viewId})`),
    ).not.toContain(viewId);
    expect(sanitizeAgentVisibleText("/settings/webhooks?view=00000000-0000-4")).toBe(
      "/settings/webhooks?view=[internal reference]",
    );
  });

  it("redacts secret assignments and private content even when they contain a saved-view URL", () => {
    const url = "/settings/webhooks?view=00000000-0000-4000-8000-000000000001";
    expect(sanitizeAgentVisibleText(`password=${url}; Safe.`)).toBe("password=[redacted]; Safe.");
    expect(sanitizeAgentVisibleText(`password=[View](${url}); Safe.`)).not.toContain("00000000");
    expect(sanitizeAgentVisibleText(`<analysis>[View](${url})</analysis>Safe.`)).toBe("Safe.");
  });

  it("redacts saved-view UUIDs before other redactions alter their Markdown context", () => {
    const recordId = "00000000-0000-4000-8000-000000000001";
    const viewId = "00000000-0000-4000-8000-000000000002";
    const timelineUrl = `/records/50000000-0000-4000-8000-000000000001/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
    const externalTitle = `[Link](https://example.invalid "${timelineUrl} Authorization: Bearer abc")`;
    const validLink = `[Activity](${timelineUrl})`;

    expect(sanitizeAgentVisibleText(externalTitle)).not.toContain(recordId);
    expect(sanitizeAgentVisibleText(externalTitle)).not.toContain(viewId);
    const sanitized = sanitizeAgentVisibleText(`${validLink}\nAuthorization: Bearer abc`);
    expect(sanitized).not.toContain(recordId);
    expect(sanitized).not.toContain(viewId);
    expect(sanitized).toContain("Authorization: [redacted]");
  });

  it("canonicalizes same-app absolute links across every provider chunk boundary", () => {
    const origin = "http://localhost:4016";
    const recordId = "00000000-0000-4000-8000-000000000001";
    const viewId = "00000000-0000-4000-8000-000000000002";
    const relativeUrl = `/records/50000000-0000-4000-8000-000000000001/${recordId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
    const source = `Created [Activity timeline](${origin}/en${relativeUrl}).`;
    const expected = "Created Activity timeline.";

    expect(sanitizeAgentVisibleTextForApp(source, origin)).toBe(expected);
    expect(sanitizeAgentVisibleTextForApp(source, "https://app.example.com")).not.toContain(viewId);
    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer(origin);
      const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
      expect(visible, `split ${split}`).toBe(expected);
    }
  });

  it("preserves sentence punctuation around bare links and canonicalizes bare same-app URLs", () => {
    const origin = "http://localhost:4016";
    const viewId = "00000000-0000-4000-8000-000000000001";
    const relative = `/settings/webhooks?view=${viewId}`;
    const sources = [
      [`Created ${relative}.`, `Created /settings/webhooks?view=[internal reference].`],
      [
        `Created ${relative}, then selected it.`,
        `Created /settings/webhooks?view=[internal reference], then selected it.`,
      ],
      [`Created ${relative}; open it now.`, `Created /settings/webhooks?view=[internal reference]; open it now.`],
      [`Created ${origin}/de${relative}.`, `Created /settings/webhooks?view=[internal reference].`],
      [`Created <${origin}/de${relative}>.`, `Created /settings/webhooks?view=[internal reference].`],
    ] as const;

    for (const [source, expected] of sources) {
      expect(sanitizeAgentVisibleTextForApp(source, origin)).toBe(expected);
      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer(origin);
        const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
        expect(visible, `source ${source}, split ${split}`).toBe(expected);
      }
    }
  });

  it.each(["plain", "?no-view=", "&no-view="])(
    "preserves a long %s token beside saved-view links at provider chunk boundaries",
    (kind) => {
      const viewId = "00000000-0000-4000-8000-000000000001";
      const token = `${"x".repeat(20_000)}${kind === "plain" ? "" : kind}${"y".repeat(20_000)}`;
      const source = `${token} Open /settings/webhooks?view=${viewId}. Raw ${viewId}. End.`;
      const expected = `${token} Open /settings/webhooks?view=[internal reference]. Raw [internal reference]. End.`;
      expect(sanitizeAgentVisibleText(source)).toBe(expected);
      for (const split of [1, source.indexOf("?view=") + 6, source.indexOf(viewId) + 1, source.length - 1]) {
        const sanitizer = new AgentVisibleTextStreamSanitizer();
        const visible =
          sanitizer.push(source.slice(0, split)) + sanitizer.push(source.slice(split)) + sanitizer.finish();
        expect(visible, `${kind} split ${split}`).toBe(expected);
        expect(visible).not.toContain(viewId);
      }
    },
  );

  it.each(SAVED_VIEW_STREAMING_CASES.map((source, sourceIndex) => ({ source, sourceIndex })))(
    "sanitizes saved-view text consistently across every provider chunk boundary: case $sourceIndex",
    ({ source, sourceIndex }) => {
      const expected = sanitizeAgentVisibleText(source);
      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer();
        const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
        expect(visible, `source ${sourceIndex}, split ${split}`).toBe(expected);
      }
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      const visible = [...source].map((character) => sanitizer.push(character)).join("") + sanitizer.finish();
      expect(visible).toBe(expected);
    },
    120_000,
  );

  it("keeps only the inert label when replaying persisted model-authored saved-view links", () => {
    const text = "Open [My view](/settings/webhooks?view=00000000-0000-4000-8000-000000000001).";
    const parts = [{ type: "text", text }];
    expect(clientSafeAgentMessageParts(parts, { sanitizeText: true })).toEqual([
      { type: "text", text: "Open My view." },
    ]);
  });

  it("unwraps an already-redacted persisted saved-view link on replay and at every stream split", () => {
    const source =
      "You can view the new list here: [Contacts with Deals](/settings/webhooks?view=[internal reference]).";
    const expected = "You can view the new list here: Contacts with Deals.";

    expect(clientSafeAgentMessageParts([{ type: "text", text: source }], { sanitizeText: true })).toEqual([
      { type: "text", text: expected },
    ]);
    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
      expect(visible, `split ${split}`).toBe(expected);
    }
    expect(sanitizeAgentVisibleText("[Contacts](/settings/webhooks?view=%5Binternal%20reference%5D)")).toBe("Contacts");
    expect(
      sanitizeAgentVisibleText(
        "[Contacts](\\/records/50000000-0000-4000-8000-000000000001\\?view\\=\\[internal reference\\])",
      ),
    ).toBe("Contacts");
    expect(
      sanitizeAgentVisibleText(
        "[Timeline](/records/50000000-0000-4000-8000-000000000001/%5Binternal%20reference%5D?view=%5Binternal%20reference%5D&viewSurface=entity-timeline)",
      ),
    ).toBe("Timeline");

    const external = "[External](https://example.com/settings/webhooks?view=[internal reference])";
    const unknown = "[Unknown](/unknown?view=[internal reference])";
    expect(sanitizeAgentVisibleText(external)).toBe(external);
    expect(sanitizeAgentVisibleText(unknown)).toBe(unknown);
  });

  it("replays redacted generic list and activity links as inert labels across stream boundaries", () => {
    const typeId = "00000000-0000-4000-8000-000000000003";
    const paths = [
      "/records/[internal reference]?view=[internal reference]",
      `/records/${typeId}/[internal reference]?view=[internal reference]&viewSurface=entity-timeline`,
      "/de/records/%5Binternal%20reference%5D/%5Binternal%20reference%5D?view=%5Binternal%20reference%5D&viewSurface=entity-timeline",
    ];
    for (const path of paths) {
      const source = `Open [Saved view](${path}).`;
      expect(sanitizeAgentVisibleText(source)).toBe("Open Saved view.");
      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer();
        expect(
          `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`,
        ).toBe("Open Saved view.");
      }
    }
    const external = "[External](https://example.com/records/[internal reference]?view=[internal reference])";
    expect(sanitizeAgentVisibleText(external)).toBe(external);
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

  it("keeps a trailing character that only starts a private marker across every chunk boundary", () => {
    const values = [
      "You change the currency in **My Company › Settings**.\n\n**Link:** `/company/settings`",
      "Open the `Settings`",
      "Use ``code``",
      "Range 1 -",
      "Value a <",
      "Tom &",
      `Quote \`${"x".repeat(64)}`,
    ];

    for (const source of values) {
      expect(sanitizeAgentVisibleText(source)).toBe(source);

      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer();
        const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
        expect(visible).toBe(source);
      }
    }
  });

  it("still removes private markers that arrive split across chunks", () => {
    const source = `Visible answer. <analysis>${"private ".repeat(12)}`;

    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
      expect(visible).toBe("Visible answer. ");
    }
  });

  it("never leaks a fragment of a stray private tag at a flush boundary", () => {
    const source = `${"a".repeat(70)} </think> ${"b".repeat(70)}`;
    const expected = sanitizeAgentVisibleText(source);

    expect(expected).not.toMatch(/think|>/);

    for (let split = 0; split <= source.length; split += 1) {
      const sanitizer = new AgentVisibleTextStreamSanitizer();
      const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
      expect(visible).toBe(expected);
    }
  });

  it("keeps record ids inside in-app route links so the link still works", () => {
    const dealId = "80000000-0000-4000-8000-000000000003";
    const threadId = "00000000-0000-4000-8000-000000000001";
    const values = [
      `Record: [CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
      `Open [the Roche thread](/inbox?threadId=${threadId}) next.`,
      `See [${"the enterprise renewal deal for Continental AG in Frankfurt am Main ".repeat(2)}](/records/60000000-0000-4000-8000-000000000002/${dealId}).`,
    ];

    for (const source of values) {
      expect(sanitizeAgentVisibleText(source)).toBe(source);

      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer();
        const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
        expect(visible).toBe(source);
        expect(sanitizeAgentVisibleText(visible)).toBe(visible);
      }
    }

    expect(agentPlainTextPreview(sanitizeAgentVisibleText(values[0] ?? ""), 140)).toBe("Record: CRM Rollout");
  });

  it("collapses other links to a record id to their label, redacts visible ids and stays stable when sanitized again", () => {
    const dealId = "80000000-0000-4000-8000-000000000003";
    const cases = [
      [
        `Record: [CRM Rollout](https://example.com/records/60000000-0000-4000-8000-000000000002/${dealId}).`,
        "Record: CRM Rollout.",
      ],
      [
        `Record: [CRM Rollout](//example.com/records/60000000-0000-4000-8000-000000000002/${dealId}).`,
        "Record: CRM Rollout.",
      ],
      [
        `Record: [Deal ${dealId}](https://example.com/records/60000000-0000-4000-8000-000000000002/${dealId})`,
        "Record: Deal [internal reference]",
      ],
      [`Chart: ![Pipeline](https://example.com/files/${dealId}.png)`, "Chart: Pipeline"],
      [
        `Record: [${dealId}](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
        `Record: [[internal reference]](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
      ],
      [
        `Record: [Deal ${dealId}](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
        `Record: [Deal [internal reference]](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
      ],
      [
        `Record: [gpt-4o renewal](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
        `Record: [[internal details] renewal](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
      ],
      [
        `Record: [apiKey=abc123](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
        `Record: [apiKey=[redacted]](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
      ],
      [
        `Record: ](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
        "Record: ](/records/[internal reference]/[internal reference])",
      ],
      [
        `Route: /records/60000000-0000-4000-8000-000000000002/${dealId}`,
        "Route: /records/[internal reference]/[internal reference]",
      ],
      ["Go to [Webhooks](/settings/webhooks).", "Go to [Webhooks](/settings/webhooks)."],
    ] as const;

    for (const [source, expected] of cases) {
      expect(sanitizeAgentVisibleText(source)).toBe(expected);
      expect(agentPlainTextPreview(expected, 500)).not.toContain(dealId);

      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer();
        const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
        expect(visible).toBe(expected);
        expect(sanitizeAgentVisibleText(visible)).toBe(visible);
      }
    }
  });

  it("keeps a record-page link next to saved-view URLs and redacts record ids that render as text", () => {
    const dealId = "80000000-0000-4000-8000-000000000003";
    const viewId = "00000000-0000-4000-8000-000000000001";
    const timelineUrl = `/records/60000000-0000-4000-8000-000000000002/${dealId}?view=${viewId}&viewSurface=${SURFACE.entityTimeline}`;
    const cases = [
      [
        `Open [CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId}) or [Pipeline view](/settings/webhooks?view=${viewId}).`,
        `Open [CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId}) or Pipeline view.`,
      ],
      [
        `Open [CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId}) then /settings/webhooks?view=${viewId} next.`,
        `Open [CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId}) then /settings/webhooks?view=[internal reference] next.`,
      ],
      [
        `[Activity](${timelineUrl}) and [CRM Rollout](/de/records/60000000-0000-4000-8000-000000000002/${dealId})`,
        `Activity and [CRM Rollout](/de/records/60000000-0000-4000-8000-000000000002/${dealId})`,
      ],
      [`[CRM Rollout](/settings/webhooks?record=${dealId})`, "CRM Rollout"],
      [`[CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId}?tab=notes)`, "CRM Rollout"],
      [`![CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId})`, "CRM Rollout"],
      [
        `\`[CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId})\``,
        "`[CRM Rollout](/records/[internal reference]/[internal reference])`",
      ],
      [
        `\\[CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
        "\\[CRM Rollout](/records/[internal reference]/[internal reference])",
      ],
      [
        `~~~\n[CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId})\n~~~`,
        "~~~\n[CRM Rollout](/records/[internal reference]/[internal reference])\n~~~",
      ],
    ] as const;

    for (const [source, expected] of cases) {
      expect(sanitizeAgentVisibleText(source)).toBe(expected);
      expect(agentPlainTextPreview(expected, 500)).not.toContain(viewId);

      for (let split = 0; split <= source.length; split += 1) {
        const sanitizer = new AgentVisibleTextStreamSanitizer();
        const visible = `${sanitizer.push(source.slice(0, split))}${sanitizer.push(source.slice(split))}${sanitizer.finish()}`;
        expect(visible).toBe(expected);
        expect(sanitizeAgentVisibleText(visible)).toBe(visible);
      }
    }
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
            affectedResources: [],
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

  it("drops an activity of an unknown kind, such as a removed website read", () => {
    const parts = clientSafeAgentMessageParts([
      {
        type: "activity",
        id: "removed-web-read",
        activity: {
          kind: "web.read",
          affectedResources: [],
          risk: "read",
          sourceDomain: "customermates.com",
          sourcePage: "customermates.com/public/overview",
        },
        status: "done",
      },
    ]);

    expect(parts).toEqual([]);
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

  it("shows a record link on plain-text surfaces as its label, never its route or id", () => {
    const dealId = "80000000-0000-4000-8000-000000000003";
    const threadId = "90000000-0000-4000-8000-000000000009";
    const cases = [
      [
        `Follow up on [CRM Rollout](/records/60000000-0000-4000-8000-000000000002/${dealId})`,
        "Follow up on CRM Rollout",
      ],
      [`Reply in [Roche rollout](/inbox?threadId=${threadId}) today`, "Reply in Roche rollout today"],
      [`[CRM *Rollout*](/de/records/60000000-0000-4000-8000-000000000002/${dealId} "Deal")`, "CRM Rollout"],
      [`[Deal [Q3]](/records/60000000-0000-4000-8000-000000000002/${dealId})`, "Deal [Q3]"],
      [`[Deal \\] x](</records/60000000-0000-4000-8000-000000000002/${dealId}>)`, "Deal ] x"],
      [`[Deal ${dealId}](/records/60000000-0000-4000-8000-000000000002/${dealId})`, "Deal [internal reference]"],
      ["Go to [Webhooks](/settings/webhooks).", "Go to [Webhooks](/settings/webhooks)."],
    ] as const;

    for (const [source, expected] of cases) {
      expect(sanitizeAgentPlainText(source)).toBe(expected);
      expect(sanitizeAgentPlainText(sanitizeAgentPlainText(source))).toBe(expected);
      expect(sanitizeAgentConversationTitle(source)).toBe(expected);
    }
    expect(sanitizeAgentVisibleText(cases[0][0])).toBe(cases[0][0]);
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

  it("reads a kept record link as its label, whatever brackets the label holds", () => {
    const dealId = "80000000-0000-4000-8000-000000000003";

    for (const [source, expected] of [
      [`Record: [Deal [Q3]](/records/60000000-0000-4000-8000-000000000002/${dealId})`, "Record: Deal [Q3]"],
      [`Record: [Deal \\] x](/records/60000000-0000-4000-8000-000000000002/${dealId})`, "Record: Deal ] x"],
      [`Record: [CRM Rollout](</records/60000000-0000-4000-8000-000000000002/${dealId}>)`, "Record: CRM Rollout"],
    ] as const) {
      const preview = agentPlainTextPreview(sanitizeAgentVisibleText(source), 140);
      expect(preview).toBe(expected);
      expect(preview).not.toContain(dealId);
    }
  });

  it("still bounds the preview length", () => {
    expect(agentPlainTextPreview(`**${"a".repeat(400)}**`, 140)).toHaveLength(140);
  });
});
