import { describe, expect, it } from "vitest";

import {
  appLinkHrefs,
  appLinkPath,
  isResolvedAppLinkPath,
  localizeAppLinks,
  parseAppLink,
  resolvePublicAppLinks,
} from "../app-links";

const LIST = "11111111-2222-4333-8444-555555555555";
const BASE = "https://crm.example";

function path(href: string) {
  const link = parseAppLink(href);
  if (!link) throw new Error(`unparsed ${href}`);
  return appLinkPath(link);
}

describe("app links", () => {
  it("resolves a fixed page and its controls", () => {
    expect(path("app:configure")).toBe("/configure");
    expect(path("app:settings/roles")).toBe("/settings/roles");
    expect(path("app:settings/roles?focus=add")).toBe("/settings/roles?focus=control%3Asettings-roles-add");
    expect(path("app:dashboard?focus=add-widget")).toBe("/dashboard?focus=control%3Adashboard-add-widget");
  });

  it("rejects list links, places and focus targets the resolver does not know", () => {
    for (const href of [
      "app:records/contact",
      "app:records/deal?focus=filter",
      "app:configure/deal",
      "app:records/projects",
      "app:configure?focus=add",
      "app:settings/roles?focus=nonexistent",
      "app:settings/unknown",
      "/settings/roles",
    ])
      expect(parseAppLink(href), href).toBeNull();
  });

  it("renders public links and refuses an unknown one", () => {
    const markdown = "Open [Configure](app:configure) and [Roles](app:settings/roles).";

    expect(appLinkHrefs(markdown)).toEqual(["app:configure", "app:settings/roles"]);
    expect(resolvePublicAppLinks(markdown, BASE)).toBe(
      `Open [Configure](${BASE}/configure) and [Roles](${BASE}/settings/roles).`,
    );
    expect(() => resolvePublicAppLinks("[x](app:nowhere)")).toThrow("Unknown app link: app:nowhere");
    expect(() => resolvePublicAppLinks("[Contacts](app:records/contact)")).toThrow(
      "Unknown app link: app:records/contact",
    );
  });

  it("turns public links in a tool result into relative app paths", () => {
    const text = resolvePublicAppLinks("[Add](app:settings/roles?focus=add), [Roles](app:settings/roles)", BASE);

    expect(localizeAppLinks(text, BASE)).toBe(
      "[Add](/settings/roles?focus=control%3Asettings-roles-add), [Roles](/settings/roles)",
    );
    for (const kept of [
      `${BASE}/en/docs/app-records`,
      `${BASE}/settings/roles?focus=control%3Asettings-roles-add&x=1`,
      `${BASE}/settings/roles#top`,
      `${BASE}/records/${LIST}`,
      `${BASE}/open/records/contact`,
    ])
      expect(localizeAppLinks(`[x](${kept})`, BASE)).toBe(`[x](${kept})`);
  });

  it("lets navigation open only resolved app link paths", () => {
    expect(isResolvedAppLinkPath("/settings/roles?focus=control%3Asettings-roles-add")).toBe(true);
    expect(isResolvedAppLinkPath("/settings/roles")).toBe(true);
    expect(isResolvedAppLinkPath("/configure")).toBe(true);
    for (const path of [
      "/operator/users",
      "/settings/roles?x=1",
      "https://evil.example/settings/roles",
      "//evil.example/settings/roles",
      `/records/${LIST}`,
      `/records/${LIST}?focus=control%3Arecords%3A${LIST}%3Aadd`,
      `/configure?focus=list%3A${LIST}`,
      "/open/records/contact",
    ])
      expect(isResolvedAppLinkPath(path), path).toBe(false);
  });
});
