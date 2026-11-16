import { describe, expect, it } from "vitest";

import { Resource } from "@/generated/prisma";

import { isAutomationsOnlyRow, visibleSystemResources } from "../role-resources";

describe("visibleSystemResources", () => {
  it("shows every system row in Cloud and in demo mode", () => {
    for (const appMode of ["cloud", "demo"] as const) {
      const resources = visibleSystemResources(appMode);

      expect(resources).toContain(Resource.inboxMessages);
      expect(resources).toContain(Resource.routines);
    }
  });

  it("keeps the routines row on self-hosted so automations access can be set and hides the inbox row", () => {
    const resources = visibleSystemResources("self-hosted");

    expect(resources).toContain(Resource.routines);
    expect(resources).not.toContain(Resource.inboxMessages);
  });

  it("keeps the order of the remaining rows on self-hosted", () => {
    const cloud = visibleSystemResources("cloud").filter((resource) => resource !== Resource.inboxMessages);

    expect(visibleSystemResources("self-hosted")).toEqual(cloud);
  });
});

describe("isAutomationsOnlyRow", () => {
  it("labels the routines row as automations only on self-hosted", () => {
    expect(isAutomationsOnlyRow(Resource.routines, "self-hosted")).toBe(true);
    expect(isAutomationsOnlyRow(Resource.routines, "cloud")).toBe(false);
    expect(isAutomationsOnlyRow(Resource.routines, "demo")).toBe(false);
  });

  it("leaves every other row alone", () => {
    expect(isAutomationsOnlyRow(Resource.inboxMessages, "self-hosted")).toBe(false);
    expect(isAutomationsOnlyRow(Resource.api, "self-hosted")).toBe(false);
  });
});
