import { describe, expect, it } from "vitest";

import { localizedSlugParams } from "../static-params";

const source = {
  getPages: (locale: string) =>
    ["smb", "consultants"].map((slug) => ({ slugs: [slug], url: `/${locale}/for/${slug}` })),
};

describe("localizedSlugParams", () => {
  it("prerenders every page of a full content locale", () => {
    expect(localizedSlugParams(source, "de", "industry")).toEqual([{ industry: "smb" }, { industry: "consultants" }]);
  });

  it("prerenders a partial marketing locale only inside its scope", () => {
    expect(localizedSlugParams(source, "fr", "industry")).toEqual([{ industry: "smb" }]);
  });

  it("prerenders nothing for a locale without marketing pages", () => {
    expect(localizedSlugParams(source, "es", "industry")).toEqual([]);
  });
});
