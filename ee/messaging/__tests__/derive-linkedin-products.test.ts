import { describe, expect, it } from "vitest";

import { deriveLinkedinProducts } from "../provider";

describe("deriveLinkedinProducts", () => {
  it("returns classic only for a classic account", () => {
    const products = deriveLinkedinProducts(["CLASSIC_PRIMARY", "CLASSIC_ARCHIVED", "CLASSIC_INMAIL"]);

    expect(products).toEqual(["classic"]);
  });

  it("returns every product whose primary inbox is present, in stable order", () => {
    const products = deriveLinkedinProducts(["RECRUITER_PRIMARY", "SALES_NAVIGATOR_PRIMARY", "CLASSIC_PRIMARY"]);

    expect(products).toEqual(["classic", "sales_navigator", "recruiter"]);
  });

  it("ignores non-primary inboxes of a product", () => {
    const products = deriveLinkedinProducts(["CLASSIC_PRIMARY", "SALES_NAVIGATOR_ARCHIVED"]);

    expect(products).toEqual(["classic"]);
  });

  it("returns an empty list when no primary inbox is present", () => {
    expect(deriveLinkedinProducts([])).toEqual([]);
    expect(deriveLinkedinProducts(["CLASSIC_ARCHIVED"])).toEqual([]);
  });
});
