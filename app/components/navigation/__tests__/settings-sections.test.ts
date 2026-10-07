import { describe, expect, it } from "vitest";

import { Resource } from "@/generated/prisma";

import { SETTINGS_SECTIONS, settingsSectionOf, visibleSubroutes } from "../settings-sections";

describe("settings sections", () => {
  it("groups account and workspace settings in their documented order", () => {
    expect(SETTINGS_SECTIONS.account.map(({ slug }) => slug)).toEqual(["profile", "channels", "api-keys"]);
    expect(SETTINGS_SECTIONS.workspace.map(({ slug }) => slug)).toEqual([
      "members",
      "roles",
      "plan",
      "activity",
      "webhooks",
    ]);
    expect(settingsSectionOf("plan")).toBe("workspace");
    expect(settingsSectionOf("unknown")).toBeNull();
  });

  it("keeps permissions and cloud-only pages exactly as before", () => {
    const onlyUsers = (resource: Resource) => resource === Resource.users;
    expect(visibleSubroutes("account", "self-hosted", onlyUsers).map(({ slug }) => slug)).toEqual(["profile"]);
    expect(visibleSubroutes("workspace", "self-hosted", () => true).map(({ slug }) => slug)).toEqual([
      "members",
      "roles",
      "activity",
      "webhooks",
    ]);
    expect(visibleSubroutes("account", "cloud", () => true).map(({ slug }) => slug)).toEqual([
      "profile",
      "channels",
      "api-keys",
    ]);
  });
});
