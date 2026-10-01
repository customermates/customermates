import { describe, expect, it } from "vitest";

import { docsRankEvidence } from "../docs-rank-evidence";
import rawDocsManifest from "@/generated/raw-docs-manifest.json";
import { splitSections } from "@/features/mcp-tools/docs-sections";

function hasBrokenSurrogate(value: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
}

describe("bounded classifier evidence", () => {
  it("uses label-backed body evidence when an unmatched request verb leaves no body match", () => {
    const operation =
      "ExampleNet links change through the remove_connection action; the action removes only the chosen account relation and preserves the other links.";
    const markdown = [
      "ExampleNet accounts have shared settings.",
      "Links connect projects to accounts through an account relation.",
      operation,
    ].join("\n\n");
    const excerpt = docsRankEvidence(markdown, "Can I delete an ExampleNet link to an account?", 160, {
      label: "ExampleNet account links",
      locale: "en",
    });
    expect(excerpt).toBe(operation);
    expect(excerpt).toContain("remove_connection");
    expect(excerpt.length).toBeLessThanOrEqual(160);
  });

  it("retains the real relationship operation when its label already covers the record types", () => {
    const page = rawDocsManifest.docs.en.concepts;
    const section = splitSections({
      slug: "concepts",
      source: "docs",
      pageTitle: page.title,
      markdown: page.content,
    }).find(({ anchor }) => anchor === "how-do-relationships-link-records");
    expect(section).toBeDefined();
    if (!section) throw new Error("Expected public documentation section");
    const body = section.text.replace(/^#{1,6} [^\n]*(?:\n|$)/u, "");
    const excerpt = docsRankEvidence(body, "Can I delete the link to an organization from a contact?", 396, {
      label: `${section.pageTitle} > ${section.headingPath.join(" > ")}`,
      locale: "en",
    });
    expect(excerpt).toContain("manage_record_links");
    expect(excerpt).toContain("the other update tools never touch links");
    expect(excerpt.length).toBeLessThanOrEqual(396);
  });

  it("keeps a matching residual instruction ahead of shared label terms", () => {
    const instruction = "Delete only the selected link; preserve the account's other relations.";
    const markdown = [
      "ExampleNet accounts have shared settings.",
      "Links connect projects to accounts through an account relation.",
      instruction,
    ].join("\n\n");
    const excerpt = docsRankEvidence(markdown, "Can I delete an ExampleNet link to an account?", instruction.length, {
      label: "ExampleNet account links",
      locale: "en",
    });
    expect(excerpt).toBe(instruction);
    expect(excerpt).not.toContain("shared settings");
    expect(excerpt.length).toBeLessThanOrEqual(instruction.length);
  });

  it("preserves the opening when all meaningful query units are already in the label", () => {
    const opening = "ExampleNet accounts have shared settings.";
    const markdown = [
      opening,
      "Links connect projects to accounts through an account relation.",
      "ExampleNet links change through remove_connection without replacing unrelated links.",
    ].join("\n\n");
    const excerpt = docsRankEvidence(markdown, "ExampleNet account links", opening.length, {
      label: "ExampleNet account links",
      locale: "en",
    });
    expect(excerpt).toBe(opening);
    expect(excerpt.length).toBeLessThanOrEqual(opening.length);
  });

  it("keeps a label-backed numeric table row when matching prose also exists", () => {
    const markdown =
      "| Provider | Limit |\n|---|---|\n| ExampleNet | 2 per hour |\n\nExampleNet also applies separate account caps.";
    const excerpt = docsRankEvidence(markdown, "ExampleNet limit", 40, {
      label: "Limits",
      locale: "en",
    });
    expect(excerpt).toContain("ExampleNet: 2 per hour");
    expect(excerpt.length).toBeLessThanOrEqual(40);
  });

  it.each([
    ["en", "LinkedIn rate limit error", "Send connection request", "50 / day"],
    ["de", "LinkedIn Limit Fehler", "Kontaktanfrage senden", "50 / Tag"],
  ] as const)("preserves numeric provider facts alongside matching %s prose", (locale, query, action, quota) => {
    const page = rawDocsManifest.docs[locale]["messaging-rate-limits"];
    const section = splitSections({
      slug: "messaging-rate-limits",
      source: "docs",
      pageTitle: page.title,
      markdown: page.content,
    }).find(({ anchor }) => anchor === "what-are-the-limits-for-sending-and-profile-lookups");
    expect(section).toBeDefined();
    if (!section) throw new Error("Expected public documentation section");
    const excerpt = docsRankEvidence(section.text, query, 400, {
      label: `${section.pageTitle} > ${section.headingPath.join(" > ")}`,
      locale,
    });
    expect(excerpt).toContain(action);
    expect(excerpt).toContain(quota);
    expect(excerpt.length).toBeLessThanOrEqual(400);
  });

  it("retains a matching clause's limiting prefix within the existing bound", () => {
    const restriction = "Never disclose tokens to a visitor";
    const excerpt = docsRankEvidence(
      `General unrelated context; ${restriction}; general guidance follows for every service.`,
      "visitor",
      restriction.length + 2,
    );
    expect(excerpt).toContain(restriction);
    expect(excerpt.length).toBeLessThanOrEqual(restriction.length + 2);
  });

  it("uses a matching resource label to break equal table-body relevance", () => {
    const markdown =
      "| Resource | Access |\n|---|---|\n| Tasks | Read access: All; Manage: Yes |\n| Contacts | Read access: All; Manage: Yes |";
    const excerpt = docsRankEvidence(markdown, "read contacts", 42, {
      locale: "en",
    });
    expect(excerpt).toContain("Contacts:");
    expect(excerpt).toContain("Read access: All");
    expect(excerpt).toContain("Manage: Yes");
    expect(excerpt).not.toContain("Tasks");
    expect(excerpt.length).toBeLessThanOrEqual(42);
  });

  it.each(["person permissions", "the person permissions"])(
    "does not let equal coverage outrank rarer instruction evidence for %s",
    (query) => {
      const opening = "A person signs in to use the workspace.";
      const instruction = "Only administrators change permissions.";
      const markdown = [opening, "A person can read shared pages.", "A person can open records.", instruction].join(
        "\n\n",
      );
      const excerpt = docsRankEvidence(markdown, query, instruction.length, {
        label: "Workspace",
        locale: "en",
      });
      expect(excerpt).toBe(instruction);
      expect(excerpt).not.toContain("signs in");
    },
  );

  it("retains a specific instruction when the page label already supplies another query unit", () => {
    const instruction = "Only administrators change permissions.";
    const excerpt = docsRankEvidence(
      "A person signs in to use the workspace.\n\nA person can read shared pages.\n\n" + instruction,
      "the person permissions",
      instruction.length,
      { label: "Person", locale: "en" },
    );
    expect(excerpt).toBe(instruction);
  });

  it.each([
    ["en", "permissions", "permission", "Permission is granted only to administrators."],
    ["de", "sortiere nach", "sortieren", "Sortieren ist auch mit einer eigenen Spalte möglich."],
    ["fr", "permissions", "permission", "La permission est réservée aux administrateurs."],
    ["it", "permessi", "permesso", "Il permesso è riservato agli amministratori."],
    ["es", "permisos", "permiso", "El permiso está reservado a los administradores."],
  ] as const)("matches %s inflections without replacing their surface wording", (locale, query, surface, sentence) => {
    const markdown = `Unrelated background.\n\n${"Background context. ".repeat(30)}${sentence}`;
    const excerpt = docsRankEvidence(markdown, query, sentence.length + 2, {
      label: "Reference",
      locale,
    });
    expect(excerpt.toLowerCase()).toContain(surface);
    expect(excerpt).toContain(sentence);
    expect(excerpt.length).toBeLessThanOrEqual(sentence.length + 2);
  });

  it("preserves literal redaction markers, regexes and identifiers inside inline code", () => {
    const literal = "The secret is shown as `********`; `__typename` and `.*` stay literal.";
    const excerpt = docsRankEvidence(literal, "secret", 160);
    expect(excerpt).toContain("********");
    expect(excerpt).toContain("__typename");
    expect(excerpt).toContain(".*");
    expect(excerpt).not.toContain("`");
  });

  it("retains all fitting consecutive consequences inside the selected prose block", () => {
    const first = "Closing a request changes its status.";
    const second = "Spam is also only a status.";
    const third = "Setting a state never sends anything to the other side.";
    const bound = first.length + second.length + third.length + 2;
    const excerpt = docsRankEvidence(
      `${first} ${second} ${third} ${"Unrelated configuration. ".repeat(30)}`,
      "closing request",
      bound,
      { label: "Inbox", locale: "en" },
    );
    expect(excerpt).toBe(`${first} ${second} ${third}`);
    expect(excerpt.length).toBeLessThanOrEqual(bound);
  });

  it("keeps a fitting prose paragraph with a paraphrased consequence", () => {
    const paragraph = "Closing a request changes its status. This never sends anything to the other side.";
    const markdown = `${paragraph}\n\nClosing requests keeps the queue organized. The status is shared by the team.`;
    const excerpt = docsRankEvidence(markdown, "does closing a request notify the customer", paragraph.length);
    expect(excerpt).toBe(paragraph);
    expect(excerpt).toContain("never sends anything");
    expect(excerpt.length).toBeLessThanOrEqual(paragraph.length);
  });

  it("keeps fitting next-sentence context inside a long prose paragraph", () => {
    const matching = "Hiding a request does not report it to the provider.";
    const consequence = "This never sends anything to the other side.";
    const markdown = `${matching} ${consequence} ${"Unrelated configuration. ".repeat(30)}`;
    const excerpt = docsRankEvidence(
      markdown,
      "does hiding a request notify the customer",
      matching.length + consequence.length + 1,
    );
    expect(excerpt).toBe(`${matching} ${consequence}`);
    expect(excerpt).toContain("never sends anything");
    expect(excerpt.length).toBeLessThanOrEqual(matching.length + consequence.length + 1);
  });

  it("does not attach consequence-like context across separate paragraphs", () => {
    const matching = "Closing a request changes its status.";
    const separate = "Anything sent to an external system has a separate workflow.";
    const excerpt = docsRankEvidence(
      `${matching}\n\n${separate}\n\n${"Unrelated configuration. ".repeat(20)}`,
      "closing request",
      matching.length + 10,
    );
    expect(excerpt).toBe(matching);
    expect(excerpt).not.toContain("external system");
  });

  it("does not match an ordinary query word inside an unrelated longer word", () => {
    const actual = "You can pause the scheduled delivery.";
    const distractor = "Canceling an operation is irreversible. Cancel requests are listed in this section.";
    const excerpt = docsRankEvidence(`${distractor}\n\n${actual}`, "can pause scheduled", actual.length);
    expect(excerpt).toBe(actual);
    expect(excerpt).not.toContain("Cancel");
  });

  it("keeps joined identifiers distinct while preserving canonical prefix and substring-script units", () => {
    expect(
      docsRankEvidence(
        "Calling list__records reads data. Calling list__records_extra writes data.",
        "list__records",
        40,
      ),
    ).toContain("list__records reads data");
    expect(docsRankEvidence("Unrelated background. An onboarding workflow creates pages.", "onboard", 44)).toContain(
      "onboarding",
    );
    expect(docsRankEvidence("Other background. 公共退款申请政策保持不变。", "退款申请", 20)).toContain("退款申请");
  });

  it("keeps the real public tool catalog's fitting capability facts", () => {
    const page = rawDocsManifest.docs.en.mcp;
    const section = splitSections({
      slug: "mcp",
      source: "docs",
      pageTitle: page.title,
      markdown: page.content,
    }).find(({ anchor }) => anchor === "tool-catalog");
    expect(section).toBeDefined();
    if (!section) throw new Error("Expected public documentation section");
    const excerpt = docsRankEvidence(section.text, "What can the MCP server do?", 478, {
      label: `${section.pageTitle} > ${section.headingPath.join(" > ")}`,
      locale: "en",
    });
    expect(excerpt).toContain("They cover records, workspace, saved views, the Knowledge Base, messaging");
    expect(excerpt).toContain("widgets, routines, webhooks, admin, and support");
    expect(excerpt).toContain("manage_record_links");
    expect(excerpt.length).toBeLessThanOrEqual(478);
  });

  it("keeps the real public thread state's consequence without increasing its bound", () => {
    const page = rawDocsManifest.docs.en["app-inbox"];
    const section = splitSections({
      slug: "app-inbox",
      source: "docs",
      pageTitle: page.title,
      markdown: page.content,
    }).find(({ anchor }) => anchor === "what-do-the-thread-states-mean");
    expect(section).toBeDefined();
    if (!section) throw new Error("Expected public documentation section");
    const excerpt = docsRankEvidence(section.text, "Does marking a conversation as closed notify the customer?", 382);
    expect(excerpt).toContain("Setting a state never sends anything to the other side.");
    expect(excerpt).toContain("Closed");
    expect(excerpt.length).toBeLessThanOrEqual(382);
  });

  it("keeps a fitting coherent capability paragraph when its aggregate evidence beats individual repeated flag details", () => {
    const opening = "It generates reports. It schedules jobs. It searches records.";
    const markdown = `${opening}\n\nReports and jobs are listed as read-only flags in the catalog.`;
    const excerpt = docsRankEvidence(markdown, "reports jobs records", opening.length + 5);
    expect(excerpt).toBe(opening);
    expect(excerpt.length).toBeLessThanOrEqual(opening.length + 5);
  });

  it("does not preserve a generic can-introduction over a stronger later action and its nearby negation", () => {
    const opening = "You can use this service to help your team.";
    const action = "You can pause scheduled exports without deleting the saved configuration.";
    const excerpt = docsRankEvidence(`${opening}\n\n${action}`, "can pause scheduled exports", action.length);
    expect(excerpt).toBe(action);
    expect(excerpt).toContain("without deleting");
    expect(excerpt).not.toContain("help your team");
  });

  it.each(["## General information", "- General information", "> General information", "| Resource | Details |"])(
    "does not treat %s as an opening prose paragraph",
    (structural) => {
      const action = "Do not delete a paused export; disabling it stops delivery.";
      const excerpt = docsRankEvidence(
        `${structural}\n${action}\n\nOther unrelated explanation.`,
        "delete paused export",
        action.length,
      );
      expect(excerpt).toContain("Do not delete a paused export");
      expect(excerpt.length).toBeLessThanOrEqual(action.length);
    },
  );

  it("retains the resource name when clipping matching table evidence", () => {
    const markdown =
      "| Resource | Scope | Details |\n|---|---|---|\n| Members | Assigned | " +
      "Background. ".repeat(30) +
      "Only your own membership is shown. |";
    const excerpt = docsRankEvidence(markdown, "own membership", 60);
    expect(excerpt).toContain("Members:");
    expect(excerpt).toContain("own membership");
    expect(excerpt).not.toMatch(/…\s*…/u);
  });
  it("keeps a matching definition when a long introductory list context exceeds the whole bound", () => {
    const markdown = [
      "A custom role restricts what its members see and change, for example to only the records assigned to them. To create one, use the Role editor: it has Name and Description fields, followed by one row for each resource, and these two columns:",
      "",
      "- **Manage**: Yes allows editing and No prevents it.",
      "- **Read access**: All shows every record, Assigned shows only records assigned to the member, and None hides the page.",
    ].join("\n");
    const excerpt = docsRankEvidence(markdown, "only records assigned", 60);
    expect(excerpt).toContain("only records assigned");
    expect(excerpt.length).toBeLessThanOrEqual(60);
  });

  it("centers a long matching unit without inventing affirmative evidence or losing the nearby negation", () => {
    const prefix = "General context about unrelated maintenance before the relevant detail. ".repeat(8);
    const excerpt = docsRankEvidence(
      `${prefix}The policy does not allow public access to private records.`,
      "public access private records",
      70,
    );
    expect(excerpt).toContain("not allow public access");
    expect(excerpt).toContain("private records");
    expect(excerpt.length).toBeLessThanOrEqual(70);
    expect(excerpt).not.toContain("allows public access");
  });

  it("matches canonical code identifiers before removing structural markdown", () => {
    const excerpt = docsRankEvidence(
      "Unrelated history.\n- Call `manage_record_links` to replace the link.\n**Link:** `/company/roles`.",
      "manage_record_links",
      70,
    );
    expect(excerpt).toContain("manage_record_links");
    expect(excerpt).not.toContain("company/roles");
    expect(excerpt).not.toContain("manage record links");
  });

  it.each(["list__records", "__typename", "view=__all__"])(
    "preserves literal double underscores in %s",
    (identifier) => {
      const excerpt = docsRankEvidence(`Use \`${identifier}\` for this request.`, identifier, 80);
      expect(excerpt).toContain(identifier);
      expect(excerpt).not.toContain("`");
    },
  );

  it.each([0, 1, 8, 31, 80, 400, 800])(
    "respects a %i-character UTF-16 bound without splitting Unicode points",
    (maxChars) => {
      const markdown = `${"😀 Straße 公共 ".repeat(60)} The secret is not publicly visible.`;
      const excerpt = docsRankEvidence(markdown, "straße publicly visible", maxChars);
      expect(excerpt.length).toBeLessThanOrEqual(maxChars);
      expect(hasBrokenSurrogate(excerpt)).toBe(false);
      if (maxChars === 0) expect(excerpt).toBe("");
    },
  );
});
