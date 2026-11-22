import { describe, expect, it } from "vitest";

import { Resource } from "@/generated/prisma";

import { SETTINGS_SECTIONS, settingsSectionOf, visibleSubroutes } from "../settings-sections";

describe("settings sections", () => {
  it("groups account and workspace settings in their documented order", () => {
    expect(SETTINGS_SECTIONS.account.map(({ slug }) => slug)).toEqual(["profile", "workspaces", "connections"]);
    expect(SETTINGS_SECTIONS.workspace.map(({ slug }) => slug)).toEqual([
      "general",
      "members",
      "roles",
      "billing",
      "activity",
      "agents",
      "webhooks",
      "incoming-webhooks",
      "webhook-deliveries",
    ]);
    expect(settingsSectionOf("billing")).toBe("workspace");
    expect(settingsSectionOf("agents")).toBe("workspace");
    expect(settingsSectionOf("incoming-webhooks")).toBe("workspace");
    expect(settingsSectionOf("general")).toBe("workspace");
    expect(settingsSectionOf("workspaces")).toBe("account");
    expect(settingsSectionOf("unknown")).toBeNull();
  });

  it("lists each page only for a member who may open it", () => {
    const workspace = (allowed: Resource[]) =>
      visibleSubroutes("workspace", "cloud", (resource) => allowed.includes(resource)).map(({ slug }) => slug);
    const account = (allowed: Resource[]) =>
      visibleSubroutes("account", "cloud", (resource) => allowed.includes(resource)).map(({ slug }) => slug);

    expect(workspace([])).toEqual(["general"]);
    expect(workspace([Resource.routines])).toEqual(["general"]);
    expect(workspace([Resource.company])).toEqual(["general", "billing", "agents"]);
    expect(workspace([Resource.api])).toEqual(["general", "webhooks", "incoming-webhooks", "webhook-deliveries"]);
    expect(account([])).toEqual(["profile", "workspaces"]);
    expect(account([Resource.inboxMessages])).toEqual(["profile", "workspaces", "connections"]);
    expect(account([Resource.api])).toEqual(["profile", "workspaces", "connections"]);
  });

  it("keeps permissions and cloud-only pages exactly as before", () => {
    const onlyUsers = (resource: Resource) => resource === Resource.users;
    expect(visibleSubroutes("account", "self-hosted", onlyUsers).map(({ slug }) => slug)).toEqual([
      "profile",
      "workspaces",
    ]);
    expect(visibleSubroutes("account", "self-hosted", () => true).map(({ slug }) => slug)).toEqual([
      "profile",
      "workspaces",
      "connections",
    ]);
    expect(
      visibleSubroutes("account", "self-hosted", (resource) => resource === Resource.inboxMessages).map(
        ({ slug }) => slug,
      ),
    ).toEqual(["profile", "workspaces"]);
    expect(visibleSubroutes("workspace", "self-hosted", () => true).map(({ slug }) => slug)).toEqual([
      "general",
      "members",
      "roles",
      "activity",
      "agents",
      "webhooks",
      "incoming-webhooks",
      "webhook-deliveries",
    ]);
    expect(visibleSubroutes("account", "cloud", () => true).map(({ slug }) => slug)).toEqual([
      "profile",
      "workspaces",
      "connections",
    ]);
  });

  it("keeps booking pages out of Settings because the Calendar page holds them", () => {
    expect(settingsSectionOf("booking")).toBeNull();
  });
});
