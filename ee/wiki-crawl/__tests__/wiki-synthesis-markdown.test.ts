import { describe, expect, it } from "vitest";

import { wikiSynthesisSectionMarkdown } from "../wiki-synthesis-markdown";

describe("wikiSynthesisSectionMarkdown", () => {
  it("splits inline numbered steps and double-escaped breaks into list lines, leaving prose alone", () => {
    expect(wikiSynthesisSectionMarkdown("1. Check the plan. 2. Refund within 30 days. 3. Confirm.")).toBe(
      "1. Check the plan.\n2. Refund within 30 days.\n3. Confirm.",
    );
    expect(wikiSynthesisSectionMarkdown("- A\\n- B")).toBe("- A\n- B");
    expect(wikiSynthesisSectionMarkdown("Version 2. Then more.")).toBe("Version 2. Then more.");
    expect(wikiSynthesisSectionMarkdown("1. One\n2. Two costs EUR 3. Fine")).toBe("1. One\n2. Two costs EUR 3. Fine");
  });
});
