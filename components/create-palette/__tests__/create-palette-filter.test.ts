import { describe, expect, it } from "vitest";

import { createPaletteTokens, filterCreateTemplates } from "../create-palette-filter";

const TEMPLATES = [
  { id: "offer", title: "Follow up after an offer", description: "Stage changes, then a follow-up task in 3 days" },
  { id: "enquiries", title: "Answer new enquiries", description: "Form submitted, then an agent drafts a reply" },
  {
    id: "renewal",
    title: "Remind before a renewal",
    description: "30 days before the contract ends",
    keywords: ["Vertrag"],
  },
];

const ids = (query: string) => filterCreateTemplates(TEMPLATES, query).map((template) => template.id);

describe("filterCreateTemplates", () => {
  it("keeps every template in its order while nothing meaningful is typed", () => {
    expect(ids("")).toEqual(["offer", "enquiries", "renewal"]);
    expect(ids("  a  ")).toEqual(["offer", "enquiries", "renewal"]);
  });

  it("matches word beginnings in titles, descriptions and keywords, ignoring case and accents", () => {
    expect(ids("REMIND")).toEqual(["renewal"]);
    expect(ids("draft")).toEqual(["enquiries"]);
    expect(ids("vertrág")).toEqual(["renewal"]);
    expect(ids("xyz")).toEqual([]);
  });

  it("ranks a title hit above a description hit when a sentence describes the automation", () => {
    expect(ids("when an offer is sent, create a follow-up task")).toEqual(["offer"]);
    expect(ids("remind me to reply")).toEqual(["renewal", "enquiries"]);
  });

  it("drops short and repeated words from the search", () => {
    expect(createPaletteTokens("A deal is won, a deal")).toEqual(["deal", "won"]);
  });
});
