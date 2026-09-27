import { describe, expect, it } from "vitest";

import {
  buildSectionIndex,
  docsExcerpt,
  expandQueryTokens,
  fold,
  queryIntent,
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
  it("turns faq items into headings and step titles into bold lines, expands the install snippet and drops the rest", () => {
    const markdown = unwrapDocsComponents(PAGE, (tool) => `install ${tool}`);
    expect(markdown).toContain("**Create a key**");
    expect(markdown).not.toContain("### Create a key");
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

  it("keeps a steps block and the link line after it in the section that contains them", () => {
    const all = splitSections({
      slug: "mcp",
      source: "docs",
      pageTitle: "MCP",
      markdown: unwrapDocsComponents(
        [
          "## Connect a client",
          "",
          "<Steps>",
          '<Step title="Create a key">',
          "Open API & Connectors and create a key.",
          "</Step>",
          '<Step title="Confirm the tools arrived">',
          "Ask the client to list its tools.",
          "</Step>",
          "</Steps>",
          "",
          "**Link:** the **API & Connectors** page, `/profile/api-keys`.",
          "",
          "## Next",
          "Read the catalog.",
        ].join("\n"),
        () => "",
      ),
    });
    expect(all.map((section) => section.headingPath.join(">"))).toEqual(["Connect a client", "Next"]);
    expect(all[0].text).toContain("**Confirm the tools arrived**");
    expect(all[0].text).toContain("**Link:** the **API & Connectors** page, `/profile/api-keys`.");
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

  it("stems a German plural like its singular when the singular ends in -ied, and keeps English loanword stems", () => {
    expect(stem("mitglieder", "german")).toBe(stem("mitglied", "german"));
    expect(stem("teammitglieder", "german")).toBe(stem("teammitglied", "german"));
    expect(stem("connected", "german")).toBe("connect");
    expect(stem("hosted", "german")).toBe("host");
    expect(expandQueryTokens(tokenize("Wo lade ich Mitglieder ein?", "german"), "german").synonyms).toContain("einlad");
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

  it("counts the page named in a link line like a heading when the question asks for a page address", () => {
    const page = (slug: string, markdown: string) =>
      splitSections({ slug, source: "docs", pageTitle: slug === "mcp" ? "MCP endpoint" : "Records", markdown });
    const index = buildSectionIndex(
      [
        ...page(
          "mcp",
          "## What is the MCP server endpoint URL?\nThe endpoint is <BASE_URL>/api/v1/mcp. Clients read contacts, deals and tasks through it.",
        ),
        ...page(
          "app-records",
          [
            "## What is the shared layout of a record type?",
            "Every record type has a list, a drawer and a detail page with the same search, filters and saved views.",
            "",
            "**Link:** the **Contacts** page, `/contacts`. **Mate:** `navigate` with `nav-contacts`.",
          ].join("\n"),
        ),
      ],
      "english",
    );
    expect(searchSections(index, "contacts page URL")[0]?.section.slug).toBe("app-records");
    expect(searchSections(index, "URL of the contacts page")[0]?.section.slug).toBe("app-records");
    expect(searchSections(index, "endpoint URL")[0]?.section.slug).toBe("mcp");
  });

  it("counts a link line's page name only when the question names all of it", () => {
    const page = (slug: string, pageTitle: string, markdown: string[]) =>
      splitSections({ slug, source: "docs", pageTitle, markdown: markdown.join("\n") });
    const index = buildSectionIndex(
      [
        ...page("app-company", "My Company", [
          "## Webhooks tab",
          "Lists every endpoint with its URL, events and status.",
          "",
          "**Link:** the **Webhooks** page, `/company/webhooks`.",
          "",
          "## Recent Deliveries tab",
          "Route `/company/webhook-deliveries` lists every webhook delivery with its event, status code and response, and resends a failed webhook delivery.",
          "",
          "**Link:** the **Recent Deliveries** page, `/company/webhook-deliveries`.",
        ]),
      ],
      "english",
    );
    expect(searchSections(index, "webhooks route")[0]?.section.anchor).toBe("webhooks-tab");
    expect(searchSections(index, "recent deliveries page URL")[0]?.section.anchor).toBe("recent-deliveries-tab");
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
    const excerpt = sectionExcerpt(billing, "cancel subscription", 80, "english");
    expect(excerpt).toContain("**Link:** `/a`.\nCancel the subscription here.");
    expect(excerpt).not.toContain("**Link:** `/b`.");
    expect(excerpt.split("\n").at(-1)).toBe("…");
    expect(excerpt.length).toBeLessThanOrEqual(80);
  });

  it("never picks a link line as the matching line, so the body stays in front of it", () => {
    const [webhooks] = splitSections({
      slug: "architecture-security",
      source: "docs",
      pageTitle: "Architecture and security",
      markdown: [
        "## How are webhook secrets and destinations secured?",
        "",
        "Each webhook can carry a secret that signs every delivery, and custom headers need HTTPS.",
        "",
        "Tail text that is long enough to be cut off by the budget of this excerpt.",
        "",
        "**Link:** the **Webhooks** page, `/company/webhooks`, for webhook secrets and destinations.",
      ].join("\n"),
    });
    if (!webhooks) throw new Error("Webhooks section missing");
    const excerpt = sectionExcerpt(webhooks, "webhook secrets destinations", 250, "english", true);
    expect(excerpt).toContain("Each webhook can carry a secret");
    expect(excerpt.split("\n").at(-1)).toBe(
      "**Link:** the **Webhooks** page, `/company/webhooks`, for webhook secrets and destinations.",
    );
    expect(excerpt.match(/\*\*Link:\*\*/g)).toHaveLength(1);
  });

  it("trims a matching line longer than the budget instead of returning only ellipses", () => {
    const [webhooks] = splitSections({
      slug: "app-company",
      source: "docs",
      pageTitle: "My Company",
      markdown: [
        "## Webhooks tab",
        "",
        "Intro.",
        "",
        `Route \`/company/webhooks\` lists every webhook with its URL and events. ${"More detail about the list. ".repeat(10)}`,
        "",
        "Tail.",
      ].join("\n"),
    });
    if (!webhooks) throw new Error("Webhooks section missing");
    const excerpt = sectionExcerpt({ ...webhooks, headingPath: [] }, "webhooks route", 120, "english");
    expect(excerpt).toContain("Route `/company/webhooks` lists every webhook");
    expect(excerpt.replace(/[…\s]/g, "")).not.toBe("");
    expect(excerpt.length).toBeLessThanOrEqual(124);
  });

  it("keeps the link line when the matching line is a table row and the table header no longer fits beside it", () => {
    const link =
      "**Link:** `/company/webhooks`. **Mate:** `navigate` and `highlight_element` with `nav-company-webhooks`, then `webhook-modal-secret` in the open dialog.";
    const [add] = splitSections({
      slug: "webhooks",
      source: "docs",
      pageTitle: "Webhooks",
      markdown: [
        "## Add a webhook",
        "",
        "| Field in the webhook dialog | What the field does |",
        "|---|---|",
        "| **URL** | Required. The endpoint that receives every event. |",
        "| **Secret** | Optional. Signs every delivery with an HMAC signature. |",
        "",
        link,
      ].join("\n"),
    });
    if (!add) throw new Error("Add section missing");
    const maxChars = link.length + 60;
    const excerpt = sectionExcerpt(add, "webhook secret signature", maxChars, "english", true);
    expect(excerpt.split("\n").at(-1)).toBe(link);
    expect(excerpt).toContain("| **Secret**");
    expect(excerpt.length).toBeLessThanOrEqual(maxChars + 4);
  });

  it("leaves out a table header that does not fit, rather than return the header without its row", () => {
    const [ids] = splitSections({
      slug: "app-inbox",
      source: "docs",
      pageTitle: "Inbox",
      markdown: [
        "## Which ids does the Inbox have?",
        "",
        "| Action on the Inbox page | Where it sits on the page | Anchor id of the control | What happens when it is used |",
        "|---|---|---|---|",
        "| Search threads | Inbox toolbar | `#inbox-search` | Filters the threads by subject and sender |",
        "| Refresh | Inbox toolbar | `#inbox-refresh` | Loads new threads |",
      ].join("\n"),
    });
    if (!ids) throw new Error("Inbox ids section missing");
    const excerpt = sectionExcerpt({ ...ids, headingPath: [] }, "search threads", 80, "english");
    expect(excerpt).toContain("| Search threads");
    expect(excerpt).not.toContain("| Action on the Inbox page");
    expect(excerpt.length).toBeLessThanOrEqual(84);
  });

  it("adds body text after a step title that matches the query as well as the body does", () => {
    const [connect] = splitSections({
      slug: "connect-custom-connector",
      source: "docs",
      pageTitle: "Custom connector",
      markdown: unwrapDocsComponents(
        [
          "## Can ChatGPT use an API key instead of OAuth?",
          "",
          "<Steps>",
          '<Step title="Create a key">',
          `In Customermates, open My Profile, press Add and choose Standard API key. ${"Copy the 64-character string immediately, because it is shown once. ".repeat(4)}`,
          "</Step>",
          "</Steps>",
        ].join("\n"),
        () => "",
      ),
    });
    if (!connect) throw new Error("Connector section missing");
    const excerpt = sectionExcerpt({ ...connect, headingPath: [] }, "create api key", 240, "english");
    expect(excerpt).toContain("**Create a key**");
    expect(excerpt).toContain("In Customermates, open My Profile");
    expect(excerpt.length).toBeLessThanOrEqual(244);
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
      "## Billing\nCancel the subscription here.\n…",
    );
  });
});

function section(slug: string, pageTitle: string, lines: string[]) {
  const [first] = splitSections({ slug, source: "docs", pageTitle, markdown: lines.join("\n") });
  if (!first) throw new Error(`${slug} section missing`);
  return first;
}

describe("excerpt selection by query coverage", () => {
  it("keeps a later line that covers another query term instead of only the text after the best line", () => {
    const currency = section("app-company", "My Company", [
      "## Currency",
      "",
      "The workspace currency formats every amount in the CRM.",
      "",
      "It applies to deal values, service prices and pipeline totals alike.",
      "",
      "Only roles that manage the company can pick another one.",
      "",
      "Switching does not convert amounts; the same numbers are shown.",
      "",
      "**Link:** `/company/settings`.",
    ]);
    const excerpt = sectionExcerpt(currency, "switch the currency, does it convert", 170, "english", true);
    const lines = excerpt.split("\n");
    expect(lines[0]).toBe("## Currency");
    expect(excerpt).toContain("The workspace currency formats every amount in the CRM.");
    expect(excerpt).toContain("Switching does not convert amounts; the same numbers are shown.");
    expect(excerpt).not.toContain("Only roles that manage");
    expect(excerpt.indexOf("The workspace currency")).toBeLessThan(excerpt.indexOf("Switching does not convert"));
    expect(lines.at(-1)).toBe("**Link:** `/company/settings`.");
    expect(excerpt.length).toBeLessThanOrEqual(170);
  });

  it("keeps the table header with every row that matches a query term and leaves out the rows in between", () => {
    const fields = section("app-profile", "My Profile", [
      "## Fields",
      "",
      "| Field | What it does |",
      "|---|---|",
      "| **Name** | The display name shown to teammates. |",
      "| **Email** | Where notifications are sent. |",
      "| **Country** | Stored with the profile only. |",
      "| **Avatar** | The picture next to your name. |",
      "| **Formatting Locale** | How numbers and dates are written. |",
    ]);
    const excerpt = sectionExcerpt(fields, "email formatting", 175, "english");
    const lines = excerpt.split("\n");
    expect(lines.slice(0, 3)).toEqual(["## Fields", "| Field | What it does |", "|---|---|"]);
    expect(lines).toContain("| **Email** | Where notifications are sent. |");
    expect(lines).toContain("| **Formatting Locale** | How numbers and dates are written. |");
    expect(excerpt).not.toContain("**Avatar**");
    expect(lines.indexOf("| **Email** | Where notifications are sent. |")).toBeLessThan(
      lines.indexOf("| **Formatting Locale** | How numbers and dates are written. |"),
    );
    expect(excerpt.length).toBeLessThanOrEqual(175);
  });

  it("keeps the row whose first cell is the asked term, even when another row already mentions it", () => {
    const settings = section("app-company", "My Company", [
      "## Settings",
      "",
      "| Setting | Effect |",
      "|---|---|",
      "| **Timezone** | Shown next to every currency total and every schedule on the page. |",
      "| **Logo** | Shown in the sidebar and on every invoice the workspace receives. |",
      "| **Theme** | Light, dark or the system default for every member of the workspace. |",
      "| **Currency** | Display only; switching does not convert amounts. |",
    ]);
    const excerpt = sectionExcerpt(settings, "currency", 120, "english");
    expect(excerpt).toContain("| **Currency** | Display only; switching does not convert amounts. |");
    expect(excerpt).toContain("| Setting | Effect |");
    expect(excerpt).not.toContain("**Timezone**");
    expect(excerpt.length).toBeLessThanOrEqual(120);
  });

  it("keeps the sentence of a long paragraph that covers another query term and marks the sentences it leaves out", () => {
    const schedule = section("app-routines", "Routines", [
      "## Schedules",
      "",
      [
        "Under Repeats, pick how often the routine runs, from every fifteen minutes to every month.",
        "A schedule that fits none of the presets can be set only through the assistant.",
        "The dialog then shows the expression and a button to switch back to a preset.",
        "Times use the time zone of the browser the routine was created in.",
        "The default schedule is daily at 09:00.",
      ].join(" "),
    ]);
    const excerpt = sectionExcerpt(schedule, "how often does it run, and what is the default", 200, "english");
    expect(excerpt).toContain("Under Repeats, pick how often the routine runs");
    expect(excerpt).toContain("The default schedule is daily at 09:00.");
    expect(excerpt).toMatch(/runs, from every fifteen minutes to every month\. .*… .*The default schedule/);
    expect(excerpt).not.toContain("time zone of the browser");
    expect(excerpt.length).toBeLessThanOrEqual(200);
  });

  it("fills a page excerpt from two sections: the first section's lead and link line, and the line of the second that covers what the first lacks", () => {
    const who = section("app-company", "My Company", [
      "### Who can change the settings?",
      "",
      "Every member can open the Settings page. Only roles that manage the company can change what is on it. Everyone else sees the fields read-only.",
      "",
      "**Link:** `/company/settings`.",
    ]);
    const page = section("app-company", "My Company", [
      "## Settings page",
      "",
      "The Settings page holds the currency, the pipeline weights and the data model.",
      "",
      "| Field | Effect |",
      "|---|---|",
      "| **Pipeline weights** | One percentage per stage. |",
      "| **Data model** | The name of each record type. |",
      "| **Currency** | Display only; switching does not convert amounts. |",
    ]);
    const excerpt = docsExcerpt(
      [
        { section: who, keepLinkLines: true, lead: true },
        { section: page, weight: 0.8 },
      ],
      "who can change the currency, and does it convert amounts",
      420,
      "english",
    );
    const [first, second] = excerpt.split("\n\n## ");
    expect(first.startsWith("## Who can change the settings?\nEvery member can open the Settings page.")).toBe(true);
    expect(first.split("\n").at(-1)).toBe("**Link:** `/company/settings`.");
    expect(second.startsWith("Settings page")).toBe(true);
    expect(second).toContain("| Field | Effect |");
    expect(second).toContain("| **Currency** | Display only; switching does not convert amounts. |");
    expect(excerpt.length).toBeLessThanOrEqual(420);
  });
});

describe("page-address questions", () => {
  it("recognizes a page address from page nouns, link as a noun and where-is questions, but not from a link verb or a where-do-I action", () => {
    const address = (query: string, stemmer: "english" | "german" = "english") => queryIntent(query, stemmer).address;
    for (const query of [
      "roles page URL",
      "link to the members page",
      "give me the link to the contacts list",
      "Where is the audit log?",
      "Where's the billing page?",
      "Where can I find my API keys?",
      "take me to the inbox",
    ])
      expect(address(query), query).toBe(true);
    for (const query of [
      "link a contact to an organization",
      "Where do I invite members?",
      "how do I create a routine",
      "change my email address",
    ])
      expect(address(query), query).toBe(false);
    for (const query of ["Wo ist die Seite Mitglieder?", "Link zur Webhooks-Seite", "Wo finde ich das Audit-Log?"])
      expect(address(query, "german"), query).toBe(true);
    for (const query of ["Wo lade ich Mitglieder ein?", "Wo trage ich die Webhook-URL ein?", "E-Mail-Adresse ändern"])
      expect(address(query, "german"), query).toBe(false);
  });

  it("drops the navigation words of an address question, but keeps link when it is a verb", () => {
    expect(queryIntent("Where can I find roles?", "english").tokens).toEqual([stem("roles", "english")]);
    expect(queryIntent("link to the members page", "english").tokens).not.toContain("link");
    expect(queryIntent("link a deal to a contact", "english").tokens).toContain("link");
    expect(queryIntent("Where can I find roles?", "english").pageNames).toEqual([stem("roles", "english")]);
  });

  it("reads a link between records as a relationship, not as a page address, and keeps the word link", () => {
    const english = [
      "Can I delete the link to an organization from a contact?",
      "How do I remove the link between a contact and a deal?",
      "Where are the links between contacts and deals shown?",
      "Is the link between a deal and its services stored with a quantity?",
      "How do I add a link to a task description?",
      "remove the contact organization link",
    ];
    for (const query of english) {
      expect(queryIntent(query, "english").address, query).toBe(false);
      expect(queryIntent(query, "english").tokens, query).toContain("link");
    }
    for (const query of [
      "Wie entferne ich den Link zwischen Kontakt und Organisation?",
      "Link zu einer Organisation",
    ]) {
      expect(queryIntent(query, "german").address, query).toBe(false);
      expect(queryIntent(query, "german").tokens, query).toContain("link");
    }
    for (const query of ["link to the contacts and deals pages", "What is the link to the deals page?"])
      expect(queryIntent(query, "english").address, query).toBe(true);
    for (const query of ["Gib mir den Link zur Kontaktliste", "Link zu den Einstellungen"])
      expect(queryIntent(query, "german").address, query).toBe(true);
  });

  it("reads a URL or Adresse that belongs to a thing as an attribute, and one of a page as an address", () => {
    for (const query of ["What is the webhook URL format?", "What is the URL of a webhook?"])
      expect(queryIntent(query, "english").address, query).toBe(false);
    for (const query of ["E-Mail Adresse ändern", "Adresse einer Organisation"])
      expect(queryIntent(query, "german").address, query).toBe(false);
    for (const query of [
      "What is the URL of the contacts page?",
      "roles page URL",
      "Which URL should I use for the custom connector?",
    ])
      expect(queryIntent(query, "english").address, query).toBe(true);
    expect(queryIntent("URL der Rollen-Seite", "german").address).toBe(true);
  });

  const members = () =>
    buildSectionIndex(
      [
        ...splitSections({
          slug: "app-company",
          source: "docs",
          pageTitle: "My Company",
          markdown: [
            "## Members page",
            "The Members page lists the people in the workspace.",
            "",
            "**Link:** the link to the **Members** page, `/company/members`.",
            "",
            "### How do invitations work?",
            "Invite members by email or share the invitation link; invited members join once an admin approves the members.",
            "",
            "**Link:** `/company/members`.",
          ].join("\n"),
        }),
        ...splitSections({
          slug: "mcp",
          source: "docs",
          pageTitle: "MCP",
          markdown: [
            "## Team tools",
            "Tools list the members of the team and update members.",
            "",
            "**Link:** the **Members** page, `/company/members`.",
          ].join("\n"),
        }),
      ],
      "english",
    );

  it("ranks the section whose link line introduces the page above sections that name it or only carry its route", () => {
    for (const query of ["Where are the members?", "link to the members page", "members page URL"])
      expect(searchSections(members(), query)[0]?.section.anchor, query).toBe("members-page");
    expect(searchSections(members(), "how do invitations work")[0]?.section.anchor).toBe("how-do-invitations-work");
  });

  it("counts every page an introducing link line names, including the pages in its parentheses", () => {
    const index = buildSectionIndex(
      [
        ...splitSections({
          slug: "app-records",
          source: "docs",
          pageTitle: "Records",
          markdown: [
            "## Where do I see my records?",
            "Every record type has its own list.",
            "",
            "**Link:** the link to the **Contacts** page, `/contacts` (likewise **Deals** `/deals` and **Tasks** `/tasks`).",
            "",
            "## What is special about deals?",
            "Deals carry a value and a stage; deals are listed with their totals.",
            "",
            "**Link:** the **Deals** page, `/deals`.",
          ].join("\n"),
        }),
      ],
      "english",
    );
    expect(searchSections(index, "link to the deals page")[0]?.section.anchor).toBe("where-do-i-see-my-records");
    expect(searchSections(index, "what is special about deals")[0]?.section.anchor).toBe("what-is-special-about-deals");
  });
});

describe("vocabulary families", () => {
  const synonymsOf = (query: string, stemmer: "english" | "german" = "english") =>
    expandQueryTokens(tokenize(query, stemmer), stemmer).synonyms;

  it("treats the workspace-account, sharing, billing, payment, ending, mailbox, change-log and restriction words of a question as the docs' words", () => {
    for (const [query, docsWord] of [
      ["user", "member"],
      ["teammate", "member"],
      ["member", "user"],
      ["share", "shared"],
      ["billing", "subscription"],
      ["pay", "billed"],
      ["expires", "ends"],
      ["mailbox", "email"],
      ["changelog", "audit"],
    ] as const)
      expect(synonymsOf(query), `${query} ~ ${docsWord}`).toContain(stem(docsWord, "english"));
    for (const [query, docsWord] of [
      ["Nutzer", "mitglied"],
      ["Postfach", "posteingang"],
      ["abläuft", "endet"],
      ["Änderungsverlauf", "protokoll"],
    ] as const)
      expect(synonymsOf(query, "german"), `${query} ~ ${docsWord}`).toContain(stem(fold(docsWord), "german"));
    expect(tokenize("einschränken", "german")).toEqual(tokenize("beschränkt", "german"));
  });

  it("keeps unrelated words apart", () => {
    expect(synonymsOf("user")).not.toContain(stem("invitation", "english"));
    expect(synonymsOf("share")).not.toContain(stem("member", "english"));
    expect(synonymsOf("restrict")).not.toContain(stem("rate", "english"));
  });

  it("lets a message question reach Inbox conversations, but keeps conversations and chats off the Messaging headings", () => {
    expect(synonymsOf("messages")).toContain(stem("conversation", "english"));
    expect(synonymsOf("Nachrichten", "german")).toContain(stem("konversation", "german"));
    expect(synonymsOf("Unterhaltung", "german")).toContain(stem("konversation", "german"));
    expect(synonymsOf("conversation")).toContain(stem("thread", "english"));
    expect(synonymsOf("conversation")).not.toContain(stem("messaging", "english"));
    expect(synonymsOf("Konversation", "german")).not.toContain(stem("nachricht", "german"));
    expect(synonymsOf("chat")).toEqual([]);
    expect(tokenize("my WhatsApp chats")).toEqual(tokenize("my WhatsApp conversation"));
    expect(tokenize("meine WhatsApp-Chats", "german")).toEqual(tokenize("meine WhatsApp-Konversation", "german"));
    expect(tokenize("chat with Mate")).toContain(stem("chat", "english"));
  });

  it("reads an English e-mail as email, and leaves the German E-Mail as it is", () => {
    expect(tokenize("send an e-mail signature")).toEqual(tokenize("send an email signature"));
    expect(tokenize("E-Mails")).toEqual(tokenize("emails"));
    expect(tokenize("E-Mail senden", "german")).toEqual(tokenize("Mail senden", "german"));
  });

  it("keeps words that often mean a customer's people, or several kinds of history, out of the account and audit families", () => {
    for (const word of ["colleague", "employee", "salesperson"])
      expect(synonymsOf(word), word).not.toContain(stem("member", "english"));
    for (const word of ["Kollegen", "Mitarbeiter"])
      expect(synonymsOf(word, "german"), word).not.toContain(stem("mitglied", "german"));
    expect(synonymsOf("history")).not.toContain(stem("audit", "english"));
    expect(synonymsOf("freigeben", "german")).not.toContain(stem("genehmigung", "german"));
  });

  it("stems German -tionen plurals like the singular and drops German function words", () => {
    expect(stem("organisationen", "german")).toBe(stem("organisation", "german"));
    expect(stem("optionen", "german")).toBe(stem("option", "german"));
    expect(tokenize("Wie viele Credits darf ein Lauf haben, wenn er sich wiederholt?", "german")).toEqual(
      tokenize("viele Credits Lauf wiederholt", "german"),
    );
  });
});

describe("price, credit and plan words", () => {
  const synonymsOf = (query: string, stemmer: "english" | "german" = "english") =>
    expandQueryTokens(tokenize(query, stemmer), stemmer).synonyms;

  it("keeps AI credits apart from prices and plans, and treats cost and price as one family", () => {
    for (const word of ["plan", "price", "cost"])
      expect(synonymsOf("credits"), `credits !~ ${word}`).not.toContain(stem(word, "english"));
    expect(synonymsOf("cost")).toContain(stem("price", "english"));
    expect(synonymsOf("cost")).not.toContain(stem("plan", "english"));
    expect(synonymsOf("Kosten", "german")).toContain(stem("preis", "german"));
  });

  it("reads charged as billed, and keeps being in charge of something and a deal's worth out of the price family", () => {
    expect(tokenize("charged")).toEqual(tokenize("billed"));
    for (const word of ["charge", "charged", "worth"])
      expect(synonymsOf("price"), `price !~ ${word}`).not.toContain(tokenize(word)[0]);
    expect(synonymsOf("Who is in charge of a task?")).not.toContain(stem("price", "english"));
  });

  it("stems a German plural of a word ending in -s like its singular", () => {
    expect(stem("preise", "german")).toBe(stem("preis", "german"));
    expect(stem("hinweise", "german")).toBe(stem("hinweis", "german"));
    expect(stem("prozesse", "german")).not.toBe(stem("proze", "german"));
  });
});

describe("equivalent words and phrases", () => {
  const words = (query: string, stemmer: "english" | "german" = "english") => new Set(tokenize(query, stemmer));

  it("reads the German create and set-up verbs, with their particles, as the docs' anlegen", () => {
    const docs = words("Wie lege ich einen Webhook an?", "german");
    for (const query of [
      "Wie erstelle ich einen Webhook?",
      "Wie richte ich einen Webhook ein?",
      "Wie füge ich einen Webhook hinzu?",
      "Webhook erzeugen",
    ])
      expect(words(query, "german"), query).toEqual(docs);
    expect(words("Wie lege ich ein Diagramm-Widget im Widget-Editor an?", "german")).toEqual(
      words("Wie erstelle ich ein Diagramm-Widget im Widget-Editor?", "german"),
    );
    expect(tokenize("Einrichtung", "german")).not.toEqual(tokenize("einrichten", "german"));
    expect(tokenize("Erstellungsdatum", "german")).not.toEqual(tokenize("erstellt", "german"));
  });

  it("maps a German verb to anlegen only with its particle, and never the adjective neu", () => {
    const create = stem("anlegen", "german");
    for (const query of [
      "Was ist neu in Customermates?",
      "Wer legt die Rechte einer Rolle fest?",
      "Der Preis richtet sich nach der Zahl der Nutzer",
      "Wie füge ich einen Link in eine E-Mail ein?",
    ])
      expect(tokenize(query, "german"), query).not.toContain(create);
    expect(queryIntent("Wie lege ich einen neuen Workspace an?", "german").tokens).toEqual(
      tokenize("anlegen Workspace", "german"),
    );
    expect(queryIntent("How do I create a new contact?").tokens).toEqual(tokenize("create contact"));
    expect(queryIntent("How do I start a new conversation?").tokens).toContain(stem("new", "english"));
    expect(tokenize("How do I set up a webhook?")).toEqual(tokenize("How do I create a webhook?"));
    expect(tokenize("set up Claude Code")).not.toContain(stem("create", "english"));
  });

  it("reads läuft ... ab as the expiry word abläuft, and a routine that runs automatically as an automatic routine", () => {
    const expires = tokenize("abläuft", "german");
    for (const query of ["Wann läuft meine Testphase ab?", "Laufen Keys ab?", "Mein Key ist abgelaufen"])
      expect(tokenize(query, "german"), query).toEqual(expect.arrayContaining(expires));
    expect(tokenize("Wann läuft meine Testphase ab?", "german")).not.toContain(stem("lauft", "german"));
    expect(expandQueryTokens(tokenize("läuft", "german"), "german").synonyms).not.toContain(stem("lauf", "german"));
    expect(tokenize("Wie erstelle ich eine Routine, die automatisch läuft?", "german")).toEqual(
      tokenize("Wie erstelle ich eine Routine automatisch?", "german"),
    );
  });

  it("reads Schlüssel as the docs' Key, and the German restriction words as one word", () => {
    expect(tokenize("API-Schlüssel", "german")).toEqual(tokenize("API-Key", "german"));
    expect(tokenize("API-Schlüsseln", "german")).toEqual(tokenize("API-Key", "german"));
    for (const word of ["einschränken", "eingeschränkten", "Beschränkung"])
      expect(tokenize(word, "german"), word).toEqual(tokenize("beschränken", "german"));
    expect(tokenize("kostet", "german")).toEqual(tokenize("Kosten", "german"));
  });

  it("reads running the product on one's own server as self-hosting, and the MCP server as MCP", () => {
    for (const [query, stemmer] of [
      ["install it on my own server", "english"],
      ["Is there an on-premise version?", "english"],
      ["install Customermates on a server", "english"],
      ["Kann ich Customermates selbst betreiben?", "german"],
      ["auf meinem eigenen Server installieren", "german"],
    ] as const) {
      const tokens = tokenize(query, stemmer);
      expect(tokens, query).toEqual(expect.arrayContaining(tokenize("self host", stemmer)));
      expect(tokens, query).not.toContain(stem("server", stemmer));
    }
    expect(tokenize("MCP server endpoint")).toEqual(tokenize("MCP endpoint"));
    expect(tokenize("install the MCP server in Cursor")).not.toContain(stem("self", "english"));
  });

  it("reads a custom field as the docs' custom column", () => {
    expect(tokenize("sort by a custom field")).toEqual(tokenize("sort by a custom column"));
    expect(tokenize("benutzerdefinierte Felder", "german")).toEqual(tokenize("Custom Column", "german"));
  });

  it("splits a German page compound into the page name and Seite, in questions and in the docs", () => {
    expect(tokenize("Mitgliederseite", "german")).toEqual(tokenize("Mitglieder-Seite", "german"));
    expect(tokenize("Rollenseiten", "german")).toEqual(tokenize("Rollen-Seiten", "german"));
    expect(tokenize("Seite", "german")).toEqual([stem("seite", "german")]);
    const intent = queryIntent("Link zur Mitgliederseite", "german");
    expect(intent.address).toBe(true);
    expect(intent.pageNames).toEqual([stem("mitglieder", "german")]);
    expect(tokenize("homeseite", "english")).toHaveLength(1);
  });

  it("drops quantity and connector words that name no subject", () => {
    expect(tokenize("How much does it cost during the trial")).toEqual(tokenize("cost trial"));
    expect(tokenize("Wie viele Credits, dass", "german")).toEqual(tokenize("Credits", "german"));
  });
});

describe("query concepts", () => {
  const concepts = (query: string, stemmer: "english" | "german" = "english") => queryIntent(query, stemmer).concepts;
  const termsOf = (text: string, stemmer: "english" | "german" = "english") => tokenize(text, stemmer);

  it("reads a question about the product's price as a question about the plans, and only then", () => {
    for (const query of [
      "How much does Customermates cost?",
      "pricing",
      "What does it cost per user and month?",
      "How much does Customermates cost for a team of 5?",
      "How much do I pay per user?",
      "What is the monthly fee?",
    ])
      expect(concepts(query), query).toEqual(termsOf("plan price"));
    expect(concepts("Was kostet der Business-Tarif?", "german")).toEqual(termsOf("preis", "german"));
    for (const query of [
      "Was kostet Customermates für 10 Nutzer?",
      "Was zahle ich pro Nutzer?",
      "Wie hoch ist die monatliche Gebühr?",
    ])
      expect(concepts(query, "german"), query).toEqual(termsOf("tarif preis", "german"));
    for (const query of [
      "How much does a simple Mate question cost?",
      "How many credits does a request cost?",
      "How much does a service cost in a deal?",
      "How much do I pay for AI credits?",
      "Do I have to pay for self-hosting?",
    ])
      expect(concepts(query), query).toEqual([]);
    expect(concepts("Muss ich für Self-Hosting zahlen?", "german")).toEqual([]);
  });

  it("reads paying or being billed for users as a seat question, not a price question", () => {
    for (const query of ["Do I pay for inactive users?", "Am I charged for deactivated users?"])
      expect(concepts(query), query).toEqual(termsOf("seat"));
    for (const query of ["Werde ich für inaktive Nutzer berechnet?", "Zahle ich für deaktivierte Nutzer?"])
      expect(concepts(query, "german"), query).toEqual(termsOf("nutzerplatz", "german"));
    expect(concepts("How much do I pay per user?")).not.toContain(stem("seat", "english"));
    expect(concepts("Who is in charge of a task?")).toEqual([]);
  });

  it("reads who-sees-what questions as role questions about Read access Assigned, but not API key scopes", () => {
    for (const [query, stemmer] of [
      ["How do I restrict a salesperson to only see their own deals?", "english"],
      ["Can users only see their own contacts?", "english"],
      ["Nur eigene Kontakte sehen", "german"],
      ["Wie erstelle ich eine eigene Rolle mit eingeschränkten Rechten?", "german"],
    ] as const) {
      const assigned = stemmer === "english" ? termsOf("assigned") : termsOf("zugewiesen", "german");
      expect(concepts(query, stemmer), query).toEqual(expect.arrayContaining(assigned));
    }
    expect(concepts("Can I restrict an API key to read-only?")).toEqual([]);
    expect(concepts("Can I edit my own role?")).toEqual([]);
  });

  it("reads messages named by their provider as Inbox questions, but not connecting a provider or its sending limits", () => {
    expect(concepts("Can I see my LinkedIn messages in the CRM?")).toEqual(termsOf("inbox"));
    expect(concepts("Sehe ich meine WhatsApp-Nachrichten im CRM?", "german")).toEqual(termsOf("posteingang", "german"));
    for (const query of [
      "How do I connect WhatsApp?",
      "How many LinkedIn messages can I send per day?",
      "What are the LinkedIn rate limits?",
    ])
      expect(concepts(query), query).toEqual([]);
    expect(concepts("reactivate a disconnected LinkedIn account")).not.toContain(stem("inbox", "english"));
  });

  it("reads a channel's status label or trouble as a question about channel status and reactivating", () => {
    for (const query of [
      "My Gmail channel says Reconnect needed",
      "Reconnect needed",
      "My Outlook channel shows Permission issue",
      "Gmail stopped syncing",
    ])
      expect(concepts(query), query).toEqual(termsOf("reactivate status"));
    for (const query of [
      "Mein Gmail-Kanal zeigt Erneute Verbindung nötig",
      "Mein Outlook-Kanal zeigt Berechtigungsproblem",
    ])
      expect(concepts(query, "german"), query).toEqual(termsOf("reaktivieren status", "german"));
    expect(concepts("Erneute Verbindung nötig", "german")).toEqual(termsOf("reaktivieren status", "german"));
    for (const query of [
      "How do I connect WhatsApp?",
      "I have a permission issue creating contacts",
      "webhook delivery error",
      "How do I reconnect Claude after the connection expired?",
      "LinkedIn rate limit error",
      "Error connecting my Gmail channel",
    ])
      expect(concepts(query), query).toEqual([]);
    for (const query of [
      "LinkedIn Limit Fehler",
      "Fehler beim Verbinden des Gmail-Kanals",
      "Claude erneute Verbindung",
      "Wie stelle ich eine erneute Verbindung zu Claude her?",
    ])
      expect(concepts(query, "german"), query).toEqual([]);
  });

  it("reads connecting an email account or inbox as a question about channels", () => {
    for (const query of [
      "how do I connect my email",
      "can I connect my work email",
      "Can I connect my e-mail account?",
      "can I connect a shared inbox",
      "connect IMAP",
    ])
      expect(concepts(query), query).toEqual(termsOf("channel"));
    for (const query of ["How do I set an email signature?", "connect Claude", "How do I connect WhatsApp?"])
      expect(concepts(query), query).toEqual([]);
  });

  it("reads which-tools and what-can-it-do questions as tool catalog questions", () => {
    for (const [query, stemmer] of [
      ["Which tools does the MCP server provide?", "english"],
      ["What can the MCP server do?", "english"],
      ["show me all MCP tools", "english"],
      ["Welche Tools bietet der MCP-Server?", "german"],
    ] as const)
      expect(concepts(query, stemmer), query).toEqual(termsOf(stemmer === "english" ? "catalog" : "katalog", stemmer));
    for (const [query, stemmer] of [
      ["Which tools can Mate use?", "english"],
      ["Which tools are available to Mate?", "english"],
      ["What tools does the assistant offer?", "english"],
      ["Welche Tools bietet der Assistent?", "german"],
      ["Welche Tools gibt es für Mate?", "german"],
    ] as const)
      expect(concepts(query, stemmer), query).toEqual([]);
  });

  it("reads sorting a list by a field as the Sort by menu and filtering by a custom column as its operators", () => {
    expect(concepts("How do I sort a list by a custom field?")).toEqual(termsOf("ascending"));
    expect(concepts("Sort contacts alphabetically")).toEqual(termsOf("ascending"));
    expect(concepts("Wie sortiere ich nach einem Feld?", "german")).toEqual(termsOf("aufsteigend", "german"));
    expect(concepts("Wie sortiere ich Aufgaben nach Fälligkeit?", "german")).toEqual(termsOf("aufsteigend", "german"));
    for (const [query, stemmer] of [
      ["sort results over the API", "english"],
      ["How do I sort a list?", "english"],
      ["Can I sort the inbox by date?", "english"],
      ["In which order does global search sort results?", "english"],
      ["How are dashboard widgets sorted by date?", "english"],
      ["Kann ich den Posteingang nach Datum sortieren?", "german"],
      ["Wie sortiere ich die Suchergebnisse nach Datum?", "german"],
    ] as const)
      expect(concepts(query, stemmer), query).toEqual([]);
    expect(concepts("How do I filter a list by a custom field?")).toEqual(termsOf("operator"));
  });

  it("adds a concept as a query term, never as a page name", () => {
    const intent = queryIntent("Where can I see my LinkedIn messages?", "english");
    expect(intent.tokens).toEqual(expect.arrayContaining(termsOf("inbox")));
    expect(intent.pageNames).not.toContain(stem("inbox", "english"));
  });
});

describe("ranking signals", () => {
  const page = (slug: string, pageTitle: string, lines: string[]) =>
    splitSections({ slug, source: "docs", pageTitle, markdown: lines.join("\n") });

  it("lets a concept word count fully in the heading of the page it names, so the page's overview answers", () => {
    const index = buildSectionIndex(
      page("app-inbox", "CRM Inbox: Threads and Replies", [
        "## What is the Inbox?",
        "The Inbox shows email, LinkedIn, WhatsApp and Telegram conversations in one list.",
        "",
        "## Do I need a connected channel?",
        "Connect a LinkedIn, WhatsApp or Telegram channel to send and receive messages on your own accounts.",
      ]),
      "english",
    );
    expect(searchSections(index, "Can I see my LinkedIn messages in the CRM?")[0]?.section.anchor).toBe(
      "what-is-the-inbox",
    );
  });

  it("prefers a parent section over a child that inherits its heading and only repeats the question's words in the body", () => {
    const index = buildSectionIndex(
      page("mcp", "Reference: Endpoint", [
        "## Tool catalog: the full list of MCP tools [#tool-catalog]",
        "Customermates exposes fifty tools for records, messaging and routines.",
        "",
        "### Tool metadata",
        "Every MCP tool is flagged, and the MCP route rejects unknown fields.",
      ]),
      "english",
    );
    expect(searchSections(index, "What can the MCP server do?")[0]?.section.anchor).toBe("tool-catalog");
  });

  it("does not let a page title win a page-address question over the section whose link line introduces that page", () => {
    const index = buildSectionIndex(
      [
        ...page("n8n", "Webhooks page", [
          "## How does the webhooks page trigger n8n?",
          "The webhooks page sends every webhook event to n8n.",
        ]),
        ...page("app-company", "My Company", [
          "## Webhooks page",
          "Lists every webhook of the workspace.",
          "",
          "**Link:** the link to the **Webhooks** page, `/company/webhooks`.",
        ]),
      ],
      "english",
    );
    expect(searchSections(index, "link to the webhooks page")[0]?.section.slug).toBe("app-company");
  });

  it("rewards a heading that repeats the question's words in order after equivalents, above one that only contains them", () => {
    const body = "Öffnen Sie API & Konnektoren und klicken Sie auf Hinzufügen.";
    const index = buildSectionIndex(
      [
        ...page("connect-cli", "Clients", ["## API-Key anlegen", body]),
        ...page("api-keys", "Clients", ["## Wie lege ich einen API-Key an?", body]),
      ],
      "german",
    );
    expect(searchSections(index, "Wie erstelle ich einen API-Schlüssel?")[0]?.section.slug).toBe("api-keys");
  });
});

describe("excerpt definitions and formulas", () => {
  const filler = "Further detail about the editor that the question does not ask about. ".repeat(6);

  it("keeps the line that defines a value the question names, even when the lead already mentions it", () => {
    const roles = section("app-company", "My Company", [
      "### How do I create a custom role?",
      "",
      "A custom role restricts what its members see, for example to only the records assigned to them.",
      "",
      filler,
      "",
      "- **Manage**: **Yes** lets the role create, edit and delete that resource.",
      "- **Read access**: **All** shows every record, **Assigned** only the records the member is an assigned user of, and **None** hides the page.",
      "",
      filler,
    ]);
    const excerpt = sectionExcerpt(roles, "restrict a member to the records assigned to them", 420, "english");
    expect(excerpt).toContain("**Assigned** only the records the member is an assigned user of");
    expect(excerpt.length).toBeLessThanOrEqual(420);
  });

  it("does not treat a bold control name inside a sentence, or a label with other words, as a definition", () => {
    const channels = section("app-profile", "My Profile", [
      "### How do I connect a channel?",
      "",
      "Open Channels and press **Connect channel** to connect an account.",
      "",
      filler,
      "",
      "- **Account already connected**: another member connected this account first.",
    ]);
    const excerpt = sectionExcerpt(channels, "connect account", 200, "english");
    expect(excerpt).not.toContain("**Account already connected**");
  });

  it("keeps the formula sentence of each section when the question asks how something is calculated", () => {
    const weighted = section("concepts", "Concepts", [
      "## How does a weighted pipeline work?",
      "",
      `A weighted pipeline values each deal by the win probability of its stage. ${filler}Each deal then carries \`weightedValue\` = its total value multiplied by the weight of its current option. Saving recalculates the weighted value of every deal.`,
    ]);
    const excerpt = sectionExcerpt(weighted, "How is the weighted pipeline value calculated?", 200, "english");
    expect(excerpt).toContain("multiplied by the weight of its current option");
    expect(excerpt.length).toBeLessThanOrEqual(200);
    const plain = sectionExcerpt(weighted, "What is a weighted pipeline?", 200, "english");
    expect(plain).toContain("values each deal by the win probability of its stage");
    expect(plain).not.toContain("multiplied by the weight");
    const credits = section("app-assistant", "Assistant", [
      "## How many credits does each plan include?",
      "",
      `Unused credits of one month are not worth anything after it ends. ${filler}One credit corresponds to one US cent of measured provider cost.`,
    ]);
    expect(sectionExcerpt(credits, "What is one credit worth?", 200, "english")).toContain(
      "One credit corresponds to one US cent",
    );
  });
});
