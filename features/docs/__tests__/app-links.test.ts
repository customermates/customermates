import { describe, expect, it } from "vitest";

import {
  appLinkHrefs,
  appLinkPath,
  isResolvedAppLinkPath,
  localizeAppLinks,
  parseAppLink,
  resolvePublicAppLinks,
} from "../app-links";

const CONTACTS = "11111111-2222-4333-8444-555555555555";
const OTHER = "66666666-7777-4888-8999-000000000000";
const workspace = { listId: () => CONTACTS };
const BASE = "https://crm.example";

function path(href: string, withWorkspace = true) {
  const link = parseAppLink(href);
  if (!link) throw new Error(`unparsed ${href}`);
  return appLinkPath(link, withWorkspace ? workspace : null);
}

describe("app links", () => {
  it("resolves a list by its preset key to the reader's list", () => {
    expect(path("app:records/contact")).toBe(`/records/${CONTACTS}`);
    expect(path("app:records/contact?focus=add")).toBe(`/records/${CONTACTS}?focus=control:records:${CONTACTS}:add`);
    expect(path("app:configure/contact")).toBe(`/configure?typeId=${CONTACTS}`);
  });

  it("resolves a fixed page and its controls without a workspace", () => {
    expect(path("app:company/roles", false)).toBe("/company/roles");
    expect(path("app:company/roles?focus=add", false)).toBe("/company/roles?focus=control:company-roles-add");
    expect(path("app:dashboard?focus=add-widget", false)).toBe("/dashboard?focus=control:dashboard-add-widget");
  });

  it("sends a workspace-dependent link through the open route when no workspace is known", () => {
    expect(path("app:records/deal?focus=filter", false)).toBe("/open/records/deal?focus=filter");
    expect(path("app:configure/task", false)).toBe("/open/configure/task");
  });

  it("rejects places and focus targets the resolver does not know", () => {
    expect(parseAppLink("app:records/projects")).toBeNull();
    expect(parseAppLink("app:records/contact?focus=layout-board")).toBeNull();
    expect(parseAppLink("app:company/roles?focus=nonexistent")).toBeNull();
    expect(parseAppLink("app:company/unknown")).toBeNull();
    expect(parseAppLink("app:configure/contact?focus=add")).toBeNull();
    expect(parseAppLink("/company/roles")).toBeNull();
  });

  it("renders public links and refuses an unknown one", () => {
    const markdown = "Open [Contacts](app:records/contact) and [Roles](app:company/roles).";

    expect(appLinkHrefs(markdown)).toEqual(["app:records/contact", "app:company/roles"]);
    expect(resolvePublicAppLinks(markdown, BASE)).toBe(
      `Open [Contacts](${BASE}/open/records/contact) and [Roles](${BASE}/company/roles).`,
    );
    expect(() => resolvePublicAppLinks("[x](app:nowhere)")).toThrow("Unknown app link: app:nowhere");
  });

  it("turns public links in a tool result into the reader's own paths", () => {
    const text = resolvePublicAppLinks("[Add](app:records/contact?focus=add), [Roles](app:company/roles)", BASE);

    expect(localizeAppLinks(text, BASE, workspace)).toBe(
      `[Add](/records/${CONTACTS}?focus=control:records:${CONTACTS}:add), [Roles](/company/roles)`,
    );
    expect(localizeAppLinks(`[Docs](${BASE}/en/docs/app-records)`, BASE, workspace)).toBe(
      `[Docs](${BASE}/en/docs/app-records)`,
    );
    for (const kept of [`${BASE}/open/records/contact?focus=add&x=1`, `${BASE}/company/roles#top`])
      expect(localizeAppLinks(`[x](${kept})`, BASE, workspace)).toBe(`[x](${kept})`);
  });

  it("lets navigation open only resolved app link paths", () => {
    expect(isResolvedAppLinkPath(`/records/${CONTACTS}?focus=control:records:${CONTACTS}:add`)).toBe(true);
    expect(isResolvedAppLinkPath(`/configure?typeId=${CONTACTS}`)).toBe(true);
    expect(isResolvedAppLinkPath("/company/roles?focus=control:company-roles-add")).toBe(true);
    expect(isResolvedAppLinkPath("/company/roles")).toBe(true);
    expect(isResolvedAppLinkPath("/operator/users")).toBe(false);
    expect(isResolvedAppLinkPath("/company/roles?x=1")).toBe(false);
    expect(isResolvedAppLinkPath("https://evil.example/company/roles")).toBe(false);
    expect(isResolvedAppLinkPath("//evil.example/company/roles")).toBe(false);
    expect(isResolvedAppLinkPath(`/records/${CONTACTS}?focus=control:records:${OTHER}:add`)).toBe(false);
    expect(isResolvedAppLinkPath(`/records/${CONTACTS}?focus=control:records:${CONTACTS}:layout-board`)).toBe(false);
    expect(isResolvedAppLinkPath(`/configure?typeId=${CONTACTS}&x=1`)).toBe(false);
  });
});
