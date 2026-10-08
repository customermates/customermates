import { describe, expect, it } from "vitest";

import { splitSections, unwrapDocsComponents } from "../docs-sections";

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
          "**Link:** the **API & Connectors** page, `/settings/api-keys`.",
          "",
          "## Next",
          "Read the catalog.",
        ].join("\n"),
        () => "",
      ),
    });
    expect(all.map((section) => section.headingPath.join(">"))).toEqual(["Connect a client", "Next"]);
    expect(all[0].text).toContain("**Confirm the tools arrived**");
    expect(all[0].text).toContain("**Link:** the **API & Connectors** page, `/settings/api-keys`.");
  });
});
