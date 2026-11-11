import { describe, expect, it } from "vitest";

import { localizedSlugParams } from "../static-params";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const source = {
  getPages: (locale: string) =>
    ["smb", "consultants"].map((slug) => ({ slugs: [slug], url: `/${locale}/for/${slug}` })),
};

describe("localizedSlugParams", () => {
  it("prerenders every page of a full content locale", () => {
    expect(localizedSlugParams(source, "de", "industry")).toEqual([{ industry: "smb" }, { industry: "consultants" }]);
  });

  it("prerenders every page of French, now a full content locale", () => {
    expect(localizedSlugParams(source, "fr", "industry")).toEqual([{ industry: "smb" }, { industry: "consultants" }]);
  });

  it.each(CONTENT_LOCALES)("prerenders every page of %s, a full content locale", (locale) => {
    expect(localizedSlugParams(source, locale, "industry")).toEqual([{ industry: "smb" }, { industry: "consultants" }]);
  });

  it("prerenders nothing for a locale without marketing pages", () => {
    expect(localizedSlugParams(source, "ja", "industry")).toEqual([]);
  });
});
