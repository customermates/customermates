import { describe, expect, it } from "vitest";

import { Resource } from "@/generated/prisma";

import { SETTINGS_SECTIONS, settingsSectionOf, visibleSubroutes } from "../settings-sections";

describe("settings sections", () => {
  it("groups account and workspace settings in their documented order", () => {
    expect(SETTINGS_SECTIONS.account.map(({ slug }) => slug)).toEqual([
      "profile",
      "workspaces",
      "channels",
      "booking",
      "api-keys",
    ]);
    expect(SETTINGS_SECTIONS.workspace.map(({ slug }) => slug)).toEqual([
      "general",
      "members",
      "roles",
      "billing",
      "activity",
      "webhooks",
      "webhook-deliveries",
      "incoming-webhooks",
    ]);
    expect(settingsSectionOf("billing")).toBe("workspace");
    expect(settingsSectionOf("incoming-webhooks")).toBe("workspace");
    expect(settingsSectionOf("general")).toBe("workspace");
    expect(settingsSectionOf("workspaces")).toBe("account");
    expect(settingsSectionOf("unknown")).toBeNull();
  });

  it("keeps permissions and cloud-only pages exactly as before", () => {
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
      "webhooks",
      "webhook-deliveries",
      "incoming-webhooks",
    ]);
    expect(visibleSubroutes("workspace", "cloud", onlyUsers).map(({ slug }) => slug)).toEqual([
      "general",
      "members",
      "roles",
    ]);
    expect(
      visibleSubroutes("workspace", "cloud", (resource) => resource === Resource.api).map(({ slug }) => slug),
    ).toEqual(["general", "webhooks", "webhook-deliveries", "incoming-webhooks"]);
    expect(visibleSubroutes("account", "cloud", () => true).map(({ slug }) => slug)).toEqual([
      "profile",
      "workspaces",
      "channels",
      "booking",
      "api-keys",
    ]);
  });
});
