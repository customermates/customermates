import { describe, expect, it } from "vitest";

import { SEARCH_TITLE_LIMIT, brandedTitle } from "../branded-title";

describe("brandedTitle", () => {
  it("appends the brand to a short title", () => {
    expect(brandedTitle("Global Search")).toBe("Global Search | Customermates");
  });

  it("appends the brand while the result still fits a search result", () => {
    const title = "x".repeat(SEARCH_TITLE_LIMIT - " | Customermates".length);

    expect(brandedTitle(title)).toBe(`${title} | Customermates`);
    expect(brandedTitle(`${title}x`)).toBe(`${title}x`);
  });

  it("leaves a title that already names the brand alone", () => {
    expect(brandedTitle("Customermates kontaktieren")).toBe("Customermates kontaktieren");
  });
});
