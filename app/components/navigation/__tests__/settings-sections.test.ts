import { describe, expect, it } from "vitest";

import { Resource } from "@/generated/prisma";

import { CONNECTIONS_REDIRECTS } from "../settings-routes";
import { SETTINGS_SECTIONS, settingsSectionOf, visibleSubroutes } from "../settings-sections";

describe("settings sections", () => {
  it("groups account and workspace settings in their documented order", () => {
    expect(SETTINGS_SECTIONS.account.map(({ slug }) => slug)).toEqual(["profile", "workspaces"]);
    expect(SETTINGS_SECTIONS.workspace.map(({ slug }) => slug)).toEqual([
      "general",
      "members",
      "roles",
      "billing",
      "activity",
      "connections",
    ]);
    expect(settingsSectionOf("billing")).toBe("workspace");
    expect(settingsSectionOf("connections")).toBe("workspace");
    expect(settingsSectionOf("general")).toBe("workspace");
    expect(settingsSectionOf("workspaces")).toBe("account");
    expect(settingsSectionOf("unknown")).toBeNull();
  });

  it("lists one Connections page instead of the pages it replaces", () => {
    const listed = new Set(
      [...SETTINGS_SECTIONS.account, ...SETTINGS_SECTIONS.workspace].map(({ slug }) => String(slug)),
    );

    for (const replaced of Object.keys(CONNECTIONS_REDIRECTS)) {
      expect(listed.has(replaced), replaced).toBe(false);
      expect(settingsSectionOf(replaced)).toBeNull();
    }
    expect(listed.has("connections")).toBe(true);
  });

  it("keeps permissions and cloud-only pages, and lets the Connections tabs gate themselves", () => {
    const onlyUsers = (resource: Resource) => resource === Resource.users;
    expect(visibleSubroutes("account", "self-hosted", onlyUsers).map(({ slug }) => slug)).toEqual([
      "profile",
      "workspaces",
    ]);
    expect(visibleSubroutes("workspace", "self-hosted", () => true).map(({ slug }) => slug)).toEqual([
      "general",
      "members",
      "roles",
      "activity",
      "connections",
    ]);
    expect(visibleSubroutes("workspace", "cloud", onlyUsers).map(({ slug }) => slug)).toEqual([
      "general",
      "members",
      "roles",
      "connections",
    ]);
    expect(
      visibleSubroutes("workspace", "cloud", (resource) => resource === Resource.api).map(({ slug }) => slug),
    ).toEqual(["general", "connections"]);
    expect(visibleSubroutes("account", "cloud", () => true).map(({ slug }) => slug)).toEqual(["profile", "workspaces"]);
  });

  it("keeps booking pages out of Settings because the Calendar page holds them", () => {
    expect(settingsSectionOf("booking")).toBeNull();
  });
});
