import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, ROUTING_LOCALES } from "@/i18n/locale-registry";

import {
  WORKSPACE_APP_ROOTS,
  WORKSPACE_HEADER,
  absoluteWorkspaceUrl,
  isWorkspaceAppPath,
  isWorkspaceSlugSegment,
  splitWorkspacePath,
  stripWorkspacePrefix,
  withWorkspaceHref,
  workspaceApiPath,
  workspaceLocalePath,
  workspacePath,
  workspaceSlugFromApiPathname,
  workspaceSlugFromPathname,
} from "../workspace-paths";
import { requestedWorkspaceSlug } from "../workspace-request-header";

const RECORD = "/records/60000000-0000-4000-8000-000000000002/80000000-0000-4000-8000-000000000003";

describe("workspace path helpers", () => {
  it("recognises every workspace app root and nothing outside them", () => {
    for (const root of WORKSPACE_APP_ROOTS) {
      expect(isWorkspaceAppPath(root)).toBe(true);
      expect(isWorkspaceAppPath(`${root}/child?x=1#y`)).toBe(true);
    }
    for (const path of [
      "/",
      "/auth/signin",
      "/pricing",
      "/docs/records",
      "/onboarding",
      "/open/records/x",
      "/recordsx",
    ])
      expect(isWorkspaceAppPath(path)).toBe(false);
  });

  it("accepts only readable slug segments", () => {
    for (const slug of ["acme", "small-business", "a1", "x".repeat(40)])
      expect(isWorkspaceSlugSegment(slug)).toBe(true);
    for (const slug of ["", "Acme", "-acme", "acme-", "a--b", "a_b", "x".repeat(41), null, undefined])
      expect(isWorkspaceSlugSegment(slug)).toBe(false);
  });

  it("splits and strips the workspace prefix with and without a locale", () => {
    expect(splitWorkspacePath(`/w/acme${RECORD}`)).toEqual({ slug: "acme", path: RECORD });
    expect(splitWorkspacePath("/w/acme")).toEqual({ slug: "acme", path: "/" });
    expect(splitWorkspacePath("/w/Bad/records")).toBeNull();
    expect(splitWorkspacePath(RECORD)).toBeNull();
    for (const locale of ROUTING_LOCALES) {
      expect(workspaceSlugFromPathname(`/${locale}/w/acme/wiki`)).toBe("acme");
      expect(stripWorkspacePrefix(`/${locale}/w/acme${RECORD}`)).toBe(`/${locale}${RECORD}`);
    }
    expect(stripWorkspacePrefix(`/w/acme${RECORD}`)).toBe(RECORD);
    expect(stripWorkspacePrefix(RECORD)).toBe(RECORD);
    expect(workspaceSlugFromPathname(RECORD)).toBeNull();
  });

  it("builds qualified app, locale, API and absolute paths", () => {
    expect(workspacePath("acme", RECORD)).toBe(`/w/acme${RECORD}`);
    expect(workspacePath("acme", "wiki")).toBe("/w/acme/wiki");
    expect(workspacePath("acme", "/")).toBe("/w/acme");
    for (const locale of ROUTING_LOCALES)
      expect(workspaceLocalePath(locale, "acme", "/dashboard")).toBe(`/${locale}/w/acme/dashboard`);
    expect(workspaceApiPath("acme", "/api/agent/messages")).toBe("/api/w/acme/agent/messages");
    expect(workspaceApiPath("acme", "agent/messages")).toBe("/api/w/acme/agent/messages");
    expect(workspaceSlugFromApiPathname("/api/w/acme/agent/messages")).toBe("acme");
    expect(workspaceSlugFromApiPathname("/api/agent/messages")).toBeNull();
    expect(workspaceSlugFromApiPathname("/api/w/Bad/agent")).toBeNull();
    expect(absoluteWorkspaceUrl("https://app.example//", null, "acme", RECORD)).toBe(
      `https://app.example/w/acme${RECORD}`,
    );
    expect(absoluteWorkspaceUrl("https://app.example", DEFAULT_LOCALE, "acme", "/wiki?page=x")).toBe(
      `https://app.example/${DEFAULT_LOCALE}/w/acme/wiki?page=x`,
    );
  });

  it("qualifies only unprefixed app hrefs and keeps search and hash", () => {
    expect(withWorkspaceHref(`${RECORD}?view=v#top`, "acme")).toBe(`/w/acme${RECORD}?view=v#top`);
    for (const locale of ROUTING_LOCALES)
      expect(withWorkspaceHref(`/${locale}/settings/billing`, "acme")).toBe(`/${locale}/w/acme/settings/billing`);
    expect(withWorkspaceHref(`/w/other${RECORD}`, "acme")).toBe(`/w/other${RECORD}`);
    for (const href of ["/auth/signin", "/pricing", "https://example.com/records/x", "//evil.example/records", "#x"])
      expect(withWorkspaceHref(href, "acme")).toBe(href);
    expect(withWorkspaceHref(RECORD, null)).toBe(RECORD);
  });

  it("reads only a valid slug from the trusted request header", () => {
    expect(requestedWorkspaceSlug(new Headers({ [WORKSPACE_HEADER]: "acme" }))).toBe("acme");
    expect(requestedWorkspaceSlug(new Headers({ [WORKSPACE_HEADER]: "../acme" }))).toBeNull();
    expect(requestedWorkspaceSlug(new Headers())).toBeNull();
  });
});
