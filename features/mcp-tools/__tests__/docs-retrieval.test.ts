import { describe, expect, it } from "vitest";

import {
  buildSectionIndex,
  expandQueryTokens,
  fold,
  searchSections,
  sectionExcerpt,
  splitSections,
  stem,
  tokenize,
  unwrapDocsComponents,
} from "../docs-retrieval";

const PAGE = `Intro paragraph about keys.

<Steps>
<Step title="Create a key">
Go to Profile and click New key.
</Step>
<Step title="Use a key">
Send it in the \`x-api-key\` header.
</Step>
</Steps>

## Hygiene

### Rotate
Rotate keys every quarter.

### Revoke
Revoke a key you no longer need.

## Limits

| Plan | Requests |
|---|---|
| Starter | 100 |
| Pro | 500 |
| Business | 1200 |

## FAQ

<Faq>
<FaqItem question="Can I reset a key?">
No. Revoke it and create a new one.
</FaqItem>
</Faq>

<McpInstallSnippet tool="claude" />
<Callout type="info">Ignored wrapper</Callout>
<CustomWidget />
`;

function sections() {
  return splitSections({
    slug: "api-keys",
    source: "docs",
    pageTitle: "API Keys",
    markdown: unwrapDocsComponents(PAGE, (tool) => `install ${tool}`),
  });
}

describe("unwrapDocsComponents", () => {
  it("turns paired step and faq components into headings, expands the install snippet and drops the rest", () => {
    const markdown = unwrapDocsComponents(PAGE, (tool) => `install ${tool}`);
    expect(markdown).toContain("### Create a key");
    expect(markdown).toContain("### Can I reset a key?");
    expect(markdown).toContain("```\ninstall claude\n```");
    for (const tag of [
      "<Steps>",
      "<Step ",
      "</Step>",
      "<Faq>",
      "<FaqItem",
      "</FaqItem>",
      "<Callout",
      "</Callout>",
      "<CustomWidget",
    ])
      expect(markdown, tag).not.toContain(tag);
  });
});

describe("splitSections", () => {
  it("nests H3 sections under their H2, keeps the intro untitled and rolls short parents over their children", () => {
    const all = sections();
    expect(all[0].headingPath).toEqual([]);
    expect(all[0].text).toContain("Intro paragraph");
    const rotate = all.find((section) => section.headingPath.at(-1) === "Rotate");
    expect(rotate?.headingPath).toEqual(["Hygiene", "Rotate"]);
    expect(rotate?.anchor).toBe("rotate");
    const pinned = splitSections({
      slug: "x",
      source: "docs",
      pageTitle: "X",
      markdown: "## Tool-Katalog [#tool-catalog]\nText\n\n## Alt {#legacy}\nMore",
    });
    expect(pinned.map((section) => [section.headingPath.at(-1), section.anchor])).toEqual([
      ["Tool-Katalog", "tool-catalog"],
      ["Alt", "legacy"],
    ]);
    const hygiene = all.find((section) => section.headingPath.join(">") === "Hygiene");
    expect(hygiene?.text).toContain("### Rotate");
    expect(hygiene?.text).toContain("Revoke a key you no longer need.");
  });
});

describe("tokenize and stem", () => {
  it("folds diacritics, drops stop words and stems per locale", () => {
    expect(fold("Fälligkeit Größe")).toBe("falligkeit grosse");
    expect(tokenize("Connecting the deals to organizations", "english")).toEqual(["connect", "deal", "organizat"]);
    expect(stem("routines", "english")).toBe("routin");
    expect(stem("Routinen".toLowerCase(), "german")).toBe("routi");
    expect(stem("verknüpfungen".normalize("NFC").replace("ü", "u"), "german")).toBe("verknupf");
    expect(tokenize("Wie verbinde ich mein E-Mail-Konto", "german")).not.toContain("wie");
  });

  it("expands synonyms per locale without echoing the primary terms", () => {
    const en = expandQueryTokens(tokenize("deal stage", "english"), "english");
    expect(en.primary).toEqual(["deal", "stage"]);
    expect(en.synonyms).toContain("statu");
    expect(en.synonyms).not.toContain("stage");
    const de = expandQueryTokens(tokenize("Deal-Phase", "german"), "german");
    expect(de.synonyms).toContain("statu");
  });
});

describe("searchSections and sectionExcerpt", () => {
  it("returns the best section per page with its heading path and anchor", () => {
    const index = buildSectionIndex(sections(), "english");
    const [hit] = searchSections(index, "rotate an api key");
    expect(hit?.section.headingPath).toEqual(["Hygiene", "Rotate"]);
    expect(hit?.section.anchor).toBe("rotate");
  });

  it("keeps the table header in front of the matching row and bounds the leading context", () => {
    const limits = sections().find((section) => section.headingPath.join(">") === "Limits");
    if (!limits) throw new Error("Limits section missing");
    const excerpt = sectionExcerpt(limits, "business plan requests", 80, "english");
    const lines = excerpt.split("\n");
    expect(lines[0]).toBe("## Limits");
    expect(lines).toContain("| Plan | Requests |");
    expect(lines.indexOf("| Plan | Requests |")).toBeLessThan(lines.indexOf("| Business | 1200 |"));
    expect(excerpt).toContain("| Pro | 500 |");
    expect(excerpt).not.toContain("| Starter | 100 |");
    expect(excerpt.length).toBeLessThanOrEqual(90);
  });

  it("returns the whole section when it fits", () => {
    const rotate = sections().find((section) => section.headingPath.at(-1) === "Rotate");
    if (!rotate) throw new Error("Rotate section missing");
    expect(sectionExcerpt(rotate, "rotate", 500, "english")).toBe("### Rotate\nRotate keys every quarter.");
  });

  it("keeps the section's link line when the matching text fills the excerpt", () => {
    const [billing] = splitSections({
      slug: "app-company",
      source: "docs",
      pageTitle: "My Company",
      markdown: [
        "## Billing",
        "",
        "Cancel the subscription in the Lemon Squeezy portal, which also holds invoices and the payment method.",
        "",
        "Refresh re-reads the subscription after a change in the portal and confirms it.",
        "",
        "**Link:** `/company/subscription`. **Mate:** `navigate` with `nav-company-subscription`.",
      ].join("\n"),
    });
    if (!billing) throw new Error("Billing section missing");
    const excerpt = sectionExcerpt(billing, "cancel subscription invoices", 260, "english", true);
    expect(excerpt.startsWith("## Billing\nCancel the subscription")).toBe(true);
    expect(excerpt).not.toContain("Refresh re-reads");
    expect(excerpt.split("\n").at(-1)).toBe(
      "**Link:** `/company/subscription`. **Mate:** `navigate` with `nav-company-subscription`.",
    );
    expect(excerpt.match(/\*\*Link:\*\*/g)).toHaveLength(1);
    expect(excerpt.length).toBeLessThanOrEqual(270);
  });

  it("appends every link line once, in order, without pulling one in as leading context", () => {
    const [billing] = splitSections({
      slug: "app-company",
      source: "docs",
      pageTitle: "My Company",
      markdown: [
        "## Billing",
        "",
        "Intro.",
        "",
        "**Link:** `/a`.",
        "Cancel the subscription here.",
        "",
        "Tail text that is long enough to be cut off by the budget.",
        "**Link:** `/b`.",
      ].join("\n"),
    });
    if (!billing) throw new Error("Billing section missing");
    const excerpt = sectionExcerpt(billing, "cancel subscription", 80, "english", true);
    const lines = excerpt.split("\n");
    expect(lines.slice(-2)).toEqual(["**Link:** `/a`.", "**Link:** `/b`."]);
    expect(excerpt.match(/\*\*Link:\*\*/g)).toHaveLength(2);
    expect(excerpt).toContain("Cancel the subscription here.");
    expect(excerpt).not.toContain("Intro.");
    expect(excerpt).not.toContain("Tail text");
    expect(excerpt.length).toBeLessThanOrEqual(84);
  });

  it("trims the matching line rather than drop the link line when both do not fit", () => {
    const [billing] = splitSections({
      slug: "app-company",
      source: "docs",
      pageTitle: "My Company",
      markdown: [
        "## Billing",
        "",
        "Cancel the subscription in the portal, which also holds invoices, the payment method and the plan.",
        "",
        "**Link:** `/company/subscription`.",
      ].join("\n"),
    });
    if (!billing) throw new Error("Billing section missing");
    const excerpt = sectionExcerpt(billing, "cancel subscription", 80, "english", true);
    expect(excerpt).toContain("Cancel the subscription");
    expect(excerpt).toContain("…");
    expect(excerpt.split("\n").at(-1)).toBe("**Link:** `/company/subscription`.");
    expect(excerpt.length).toBeLessThanOrEqual(84);
  });

  it("treats link lines as ordinary lines unless asked to keep them", () => {
    const [billing] = splitSections({
      slug: "app-company",
      source: "docs",
      pageTitle: "My Company",
      markdown: [
        "## Billing",
        "",
        "Intro.",
        "",
        "**Link:** `/a`.",
        "Cancel the subscription here.",
        "",
        "Tail text that is long enough to be cut off by the budget.",
        "**Link:** `/b`.",
      ].join("\n"),
    });
    if (!billing) throw new Error("Billing section missing");
    expect(sectionExcerpt(billing, "cancel subscription", 80, "english")).toBe(
      "## Billing\n…\n**Link:** `/a`.\nCancel the subscription here.\n\n…",
    );
  });

  it("leaves a section without a link line unchanged", () => {
    const [plain] = splitSections({
      slug: "app-company",
      source: "docs",
      pageTitle: "My Company",
      markdown: ["## Billing", "", "Cancel the subscription here.", "", "Tail text that runs past the budget."].join(
        "\n",
      ),
    });
    if (!plain) throw new Error("Billing section missing");
    expect(sectionExcerpt(plain, "cancel subscription", 45, "english")).toBe(
      "## Billing\nCancel the subscription here.\n\n…",
    );
  });
});
