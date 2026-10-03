import { describe, expect, it } from "vitest";

import { retrievalExcerpt } from "../retrieval-excerpt";

describe("bounded retrieval excerpts", () => {
  it("focuses an unquoted compound on its separate components without broadening quotes", () => {
    const markdown =
      "Unrelated background. ".repeat(80) + "\nThe support response explains how to recover the account.";
    const excerpt = retrievalExcerpt({ markdown, query: "support-response", maxChars: 80 });
    expect(excerpt).toContain("The support response explains how to recover the account.");
    expect(retrievalExcerpt({ markdown, query: '"support-response"', maxChars: 80 })).not.toContain(
      "recover the account",
    );
  });
  it("keeps a matching table row with its header and the section's own app link", () => {
    const markdown = [
      "An unrelated introduction. ".repeat(120),
      "| Option | Result |",
      "|---|---|",
      "| Default | Plain text |",
      "| Currency | Changes formatting without converting stored amounts |",
      "**Link:** `/company/settings`.",
    ].join("\n");
    const excerpt = retrievalExcerpt({
      markdown,
      query: "currency converting amounts",
      heading: "## Settings",
      maxChars: 400,
    });
    expect(excerpt).toContain("| Option | Result |");
    expect(excerpt).toContain("|---|---|");
    expect(excerpt).toContain("without converting stored amounts");
    expect(excerpt).toContain("**Link:** `/company/settings`.");
    expect(excerpt.indexOf("| Option")).toBeLessThan(excerpt.indexOf("| Currency"));
    expect(excerpt.length).toBeLessThanOrEqual(400);
  });

  it("puts the queried sentence inside the bounded prefix of a long paragraph", () => {
    const markdown =
      "General background. ".repeat(130) + "Reactivate reconnects the mailbox. " + "Additional context. ".repeat(80);
    const excerpt = retrievalExcerpt({ markdown, query: "reactivate mailbox", heading: "## Channels", maxChars: 512 });
    expect(excerpt).toContain("Reactivate reconnects the mailbox.");
    expect(excerpt.length).toBeLessThanOrEqual(512);
    expect(excerpt).not.toMatch(/…\s*…/);
  });

  it("retains a matching code fence and does not split Unicode points when truncating", () => {
    const fence = "```sh\nrestore-metadata --reconnect\n```";
    const excerpt = retrievalExcerpt({
      markdown: "Introduction. ".repeat(150) + "\n" + fence,
      query: "restore-metadata",
      maxChars: 100,
    });
    expect(excerpt).toContain(fence);
    const unicode = retrievalExcerpt({ markdown: "😀".repeat(100), query: "", maxChars: 32 });
    expect(unicode.length).toBeLessThanOrEqual(32);
    expect(unicode).not.toMatch(/[\uD800-\uDBFF]…/u);
  });
  it("retains an oversized section link without sacrificing the app route", () => {
    const markdown =
      "Introduction. ".repeat(200) +
      "\nCurrency changes formatting.\n**Link:** `/company/settings`. **Mate:** " +
      "Additional navigation guidance. ".repeat(100);
    const excerpt = retrievalExcerpt({ markdown, query: "currency formatting", heading: "## Settings", maxChars: 400 });
    expect(excerpt).toContain("Currency changes formatting.");
    expect(excerpt).toContain("**Link:** `/company/settings`.");
    expect(excerpt.length).toBeLessThanOrEqual(400);
  });

  it("bounds a heading that consumes the entire remaining excerpt", () => {
    const excerpt = retrievalExcerpt({
      markdown: "A short body.",
      query: "body",
      heading: "## " + "Heading ".repeat(50),
      maxChars: 40,
    });
    expect(excerpt.length).toBeLessThanOrEqual(40);
    expect(retrievalExcerpt({ markdown: "Body", query: "", maxChars: 0 })).toBe("");
  });

  it("closes a matching code fence when its body is too large", () => {
    const markdown = "Introduction. ".repeat(150) + "\n```sh\nrestore-metadata " + "--reconnect ".repeat(100) + "\n```";
    const excerpt = retrievalExcerpt({ markdown, query: "restore-metadata", heading: "## Recovery", maxChars: 100 });
    expect(excerpt).toContain("```sh\n");
    expect(excerpt.endsWith("\n```")).toBe(true);
    expect(excerpt.match(/```/gu)).toHaveLength(2);
    expect(excerpt.length).toBeLessThanOrEqual(100);
  });

  it("preserves the original order of selected procedure steps", () => {
    const markdown = [
      "General context. ".repeat(100),
      "1. Prepare the restore configuration.",
      "2. Restore the mailbox to reconnect safely.",
      "3. Verify the restore result.",
    ].join("\n");
    const excerpt = retrievalExcerpt({ markdown, query: "restore mailbox", maxChars: 250 });
    expect(excerpt).toContain("1. Prepare");
    expect(excerpt).toContain("2. Restore");
    expect(excerpt.indexOf("1. Prepare")).toBeLessThan(excerpt.indexOf("2. Restore"));
    expect(excerpt.indexOf("2. Restore")).toBeLessThan(excerpt.indexOf("3. Verify"));
  });

  it("keeps selected table rows together as one Markdown table", () => {
    const markdown = [
      "General context. ".repeat(100),
      "| Item | Result |",
      "|---|---|",
      "| Restore | Mailbox restored |",
      "| Verify | Mailbox verified |",
    ].join("\n");
    const excerpt = retrievalExcerpt({ markdown, query: "mailbox", maxChars: 250 });
    expect(excerpt).toContain("|---|---|\n| Restore | Mailbox restored |\n| Verify | Mailbox verified |");
  });

  it("keeps short CJK query terms when focusing a long page", () => {
    const markdown = "Unrelated background. ".repeat(100) + "\n修改语言设置。";
    const excerpt = retrievalExcerpt({ markdown, query: "语言", maxChars: 100 });
    expect(excerpt).toContain("修改语言设置。");
    expect(excerpt.length).toBeLessThanOrEqual(100);
  });
});

describe("complete answer blocks in retrieval excerpts", () => {
  it("does not let a weaker introduction crowd out a fitting action and its restriction", () => {
    const paragraph =
      "Export sends records to an Excel workbook. Only assigned members may export their own records. " +
      "Additional background. ".repeat(15);
    const excerpt = retrievalExcerpt({
      markdown: "Records have shared list settings. ".repeat(15) + "\n\n" + paragraph,
      query: "records export",
      heading: "## Records",
      maxChars: 700,
    });
    expect(excerpt).toContain("Export sends records to an Excel workbook.");
    expect(excerpt).toContain("Only assigned members may export their own records.");
    expect(excerpt).not.toContain("shared list settings");
    expect(excerpt.length).toBeLessThanOrEqual(700);
  });

  it("keeps a later action paragraph together with its permission requirement", () => {
    const paragraph =
      "To rename pipeline stages, open Edit Field. Changing the column requires Manage on that record type.";
    const excerpt = retrievalExcerpt({
      markdown: [
        "Background details. ".repeat(100),
        paragraph,
        "**Link:** `/deals`. **Mate:** " + "Additional navigation guidance. ".repeat(100),
      ].join("\n\n"),
      query: "rename pipeline stages",
      heading: "## Board columns",
      maxChars: 200,
    });
    expect(excerpt).toContain(paragraph);
    expect(excerpt).toContain("**Link:** `/deals`.");
    expect(excerpt.length).toBeLessThanOrEqual(200);
  });

  it("keeps the neighboring formula in a coherent paragraph that fits the available excerpt", () => {
    const paragraph =
      "The weighted total estimates the pipeline. Each item is multiplied by its current probability. Changing the setting recalculates all totals.";
    const excerpt = retrievalExcerpt({
      markdown: paragraph + "\n" + "Unrelated background. ".repeat(100),
      query: "weighted total",
      heading: "## Estimate",
      maxChars: 180,
    });
    expect(excerpt).toContain(paragraph);
    expect(excerpt.length).toBeLessThanOrEqual(180);
  });
  it("retains a definition list introduced by a relevant paragraph", () => {
    const definition = "**Assigned** only the records the member is an assigned user of";
    const markdown = [
      "A custom role restricts what its members see and change, for example to only the records assigned to them. To create one, use the **Role** editor: it has the fields **Name** and **Description**, plus one row per resource with two columns:",
      "",
      "- **Manage**: **Yes** lets the role create, edit and delete that resource; **No** allows none of it. There is no separate switch for create, edit or delete.",
      `- **Read access**: **All** shows every record in the workspace, ${definition}, and **None** hides the page and its records. A row without this choice shows a dash.`,
      "",
      "| Row | Manage | Read access | New role | What it controls |",
      "|---|---|---|---|---|",
      "| **Company** | Yes, No | No choice, always granted | No | Every role can open **Settings** and **Subscription**. Manage edits Settings, chooses a plan, uses **Manage with billing** and **Refresh**, and restores an expired subscription. |",
      "| **Audit Log** | No choice | All, None | None | All opens **Audit Logs** and shows the change history on record pages and in activity timelines. |",
      "| **Tasks**, **Contacts**, **Organizations**, **Deals**, **Services** | Yes, No | All, Assigned, None | No, Assigned | Read decides whether the sidebar entry appears and which records the member sees. Manage creates, edits and deletes them. |",
      "| **Routines** | Yes, No | All, Assigned, None | No, Assigned | All shows every routine, Assigned only the member's own. |",
      "",
      "**Link:** `/company/roles`. **Mate:** " + "Additional navigation guidance. ".repeat(12),
    ].join("\n");
    const excerpt = retrievalExcerpt({
      markdown,
      query: "How can I restrict a salesperson to only the deals assigned to them?",
      heading:
        "### How do I create a custom role in the role editor, for example to restrict a member to assigned records?",
      maxChars: 1_400,
    });
    expect(excerpt).toContain(definition);
    expect(excerpt).toContain("- **Manage**:");
    expect(excerpt).toContain("- **Read access**:");
    expect(excerpt).toContain("**Link:** `/company/roles`.");
    expect(excerpt.length).toBeLessThanOrEqual(1_400);
  });

  it("keeps the neighboring status definition when a semantic question names its introductory concept", () => {
    const markdown = [
      "Historical background. ".repeat(120),
      "Visibility of the workspace's members has two controls:",
      "",
      "- **Editor** permits writing the assigned entries.",
      "- **Scope** decides whether all entries or only the member's assignments are readable.",
      "",
      "Unrelated background. ".repeat(120),
      "**Link:** `/workspace/access`.",
    ].join("\n");
    const excerpt = retrievalExcerpt({
      markdown,
      query: "workspace members visibility",
      maxChars: 400,
    });
    expect(excerpt).toContain("**Editor** permits writing the assigned entries.");
    expect(excerpt).toContain("**Scope** decides whether all entries or only the member's assignments are readable.");
    expect(excerpt).toContain("**Link:** `/workspace/access`.");
    expect(excerpt.length).toBeLessThanOrEqual(400);
  });
  it("retains a relevant final item when a definition list exceeds the excerpt budget", () => {
    const markdown = [
      "Available recovery choices:",
      "- General background. " + "Additional unrelated detail. ".repeat(100),
      "- Reactivate reconnects the mailbox.",
      "**Link:** `/profile/accounts`.",
    ].join("\n");
    for (const maxChars of [400, 800, 1_400]) {
      const excerpt = retrievalExcerpt({ markdown, query: "reactivate mailbox", maxChars });
      expect(excerpt).toContain("Reactivate reconnects the mailbox.");
      expect(excerpt).toContain("**Link:** `/profile/accounts`.");
      expect(excerpt.length).toBeLessThanOrEqual(maxChars);
    }
  });
});

describe("definition-list context within the excerpt budget", () => {
  it("finds a relevant final bullet in a colon-introduced list larger than the available budget", () => {
    const intro = "Support response rules for the workspace:";
    const final = "- **Critical**: Respond within fifteen minutes and keep the requester informed.";
    const markdown = [
      intro,
      "",
      ...Array.from(
        { length: 40 },
        (_, index) => `- **Routine category ${index}**: Review during the next planned service cycle.`,
      ),
      final,
      "",
      "**Link:** `/support/response`.",
    ].join("\n");
    const excerpt = retrievalExcerpt({
      markdown,
      query: "critical respond fifteen minutes",
      heading: "## Response rules",
      maxChars: 800,
    });
    expect(markdown.length).toBeGreaterThan(800);
    expect(excerpt).toContain(intro);
    expect(excerpt).toContain(final);
    expect(excerpt).toContain("**Link:** `/support/response`.");
    expect(excerpt.length).toBeLessThanOrEqual(800);
    expect(excerpt).not.toContain("Routine category 0");
  });

  it("retains the whole short list when its introductory concept is the matching evidence", () => {
    const intro = "Support response rules for the workspace:";
    const routine = "- **Routine**: Process during the next planned service cycle.";
    const critical = "- **Critical**: Respond within fifteen minutes and keep the requester informed.";
    const block = [intro, "", routine, critical].join("\n");
    const markdown = [
      "Historical background. ".repeat(100),
      block,
      "Unrelated background. ".repeat(100),
      "**Link:** `/support/response`.",
    ].join("\n");
    const excerpt = retrievalExcerpt({
      markdown,
      query: "workspace support response rules",
      heading: "## Response rules",
      maxChars: 800,
    });
    expect(markdown.length).toBeGreaterThan(800);
    expect(block.length).toBeLessThan(800);
    expect(excerpt).toContain(block);
    expect(excerpt).toContain("**Link:** `/support/response`.");
    expect(excerpt.length).toBeLessThanOrEqual(800);
    expect(excerpt.indexOf(routine)).toBeLessThan(excerpt.indexOf(critical));
  });
});
