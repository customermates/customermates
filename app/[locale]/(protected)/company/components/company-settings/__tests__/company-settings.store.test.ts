import { describe, it, expect, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

import { EntityType } from "@/generated/prisma";

vi.mock("../../../actions", () => ({ updateCompanyAction: vi.fn() }));
vi.mock("@/app/actions", () => ({ upsertEntityTerminologyAction: vi.fn() }));

import { CompanySettingsStore } from "../company-settings.store";

const stubRootStore = {} as unknown as RootStore;

const savedOverrides = [
  { entityType: EntityType.contact, presetKey: "person" },
  { entityType: EntityType.organization, presetKey: "organization" },
  { entityType: EntityType.deal, presetKey: "project" },
  { entityType: EntityType.service, presetKey: "service" },
];

describe("CompanySettingsStore terminology", () => {
  it("initialises the form from the saved overrides", () => {
    const store = new CompanySettingsStore(stubRootStore);
    store.initTerminology(savedOverrides);

    expect(store.form.terminology).toEqual({
      contact: "person",
      organization: "organization",
      deal: "project",
      service: "service",
    });
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("ignores an empty preset key so a mounting select cannot clear the saved choice", () => {
    const store = new CompanySettingsStore(stubRootStore);
    store.initTerminology(savedOverrides);

    store.setTerminologyPreset(EntityType.contact, "");
    store.setTerminologyPreset(EntityType.deal, "");

    expect(store.form.terminology.contact).toBe("person");
    expect(store.form.terminology.deal).toBe("project");
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("ignores a preset key that does not belong to the entity", () => {
    const store = new CompanySettingsStore(stubRootStore);
    store.initTerminology(savedOverrides);

    store.setTerminologyPreset(EntityType.contact, "project");

    expect(store.form.terminology.contact).toBe("person");
  });

  it("accepts a valid preset key and marks the form dirty", () => {
    const store = new CompanySettingsStore(stubRootStore);
    store.initTerminology(savedOverrides);

    store.setTerminologyPreset(EntityType.contact, "client");

    expect(store.form.terminology.contact).toBe("client");
    expect(store.hasUnsavedChanges).toBe(true);
  });
});
