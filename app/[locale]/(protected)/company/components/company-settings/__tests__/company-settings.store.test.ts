import type { RootStore } from "@/core/stores/root.store";

import { describe, expect, it, vi } from "vitest";
import { Currency, EntityType } from "@/generated/prisma";

const actions = vi.hoisted(() => ({ updateCompanyAction: vi.fn() }));

vi.mock("../../../actions", () => actions);
vi.mock("@/app/actions", () => ({ upsertEntityTerminologyAction: vi.fn() }));

import { CompanySettingsStore } from "../company-settings.store";

function makeRootStore() {
  return {
    companyStore: {
      company: { currency: Currency.eur },
      setCompany: vi.fn(),
    },
    terminologyStore: { refresh: vi.fn().mockResolvedValue(undefined) },
  } as unknown as RootStore;
}

const savedOverrides = [
  { entityType: EntityType.contact, presetKey: "person" },
  { entityType: EntityType.organization, presetKey: "organization" },
  { entityType: EntityType.deal, presetKey: "project" },
  { entityType: EntityType.service, presetKey: "service" },
];

describe("CompanySettingsStore terminology", () => {
  it("initialises legacy saved overrides with a canonical Task and stays clean", () => {
    const store = new CompanySettingsStore(makeRootStore());
    store.initTerminology(savedOverrides);

    expect(store.form.terminology).toEqual({
      contact: "person",
      organization: "organization",
      deal: "project",
      service: "service",
      task: "task",
    });
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("ignores empty, invalid, and cross-entity preset keys", () => {
    const store = new CompanySettingsStore(makeRootStore());
    store.initTerminology(savedOverrides);

    store.setTerminologyPreset(EntityType.contact, "");
    store.setTerminologyPreset(EntityType.deal, "");
    store.setTerminologyPreset(EntityType.contact, "project");
    store.setTerminologyPreset(EntityType.task, "product");

    expect(store.form.terminology.contact).toBe("person");
    expect(store.form.terminology.deal).toBe("project");
    expect(store.form.terminology.task).toBe("task");
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("accepts a valid Task preset and marks the form dirty", () => {
    const store = new CompanySettingsStore(makeRootStore());
    store.initTerminology(savedOverrides);

    store.setTerminologyPreset(EntityType.task, "followUp");

    expect(store.form.terminology.task).toBe("followUp");
    expect(store.hasUnsavedChanges).toBe(true);
  });

  it("submits all five entries, refreshes terminology, and becomes clean", async () => {
    const rootStore = makeRootStore();
    const store = new CompanySettingsStore(rootStore);
    store.initTerminology(savedOverrides);
    store.setTerminologyPreset(EntityType.task, "todo");
    actions.updateCompanyAction.mockResolvedValue({
      ok: true,
      data: { currency: Currency.eur },
    });

    await store.onSubmit();

    expect(actions.updateCompanyAction).toHaveBeenCalledWith({
      currency: Currency.eur,
      terminology: [
        { entityType: EntityType.contact, presetKey: "person" },
        { entityType: EntityType.organization, presetKey: "organization" },
        { entityType: EntityType.deal, presetKey: "project" },
        { entityType: EntityType.service, presetKey: "service" },
        { entityType: EntityType.task, presetKey: "todo" },
      ],
    });
    expect(rootStore.terminologyStore.refresh).toHaveBeenCalledOnce();
    expect(store.hasUnsavedChanges).toBe(false);
  });

  it("keeps a failed Task change dirty and does not refresh terminology", async () => {
    const rootStore = makeRootStore();
    const store = new CompanySettingsStore(rootStore);
    store.initTerminology(savedOverrides);
    store.setTerminologyPreset(EntityType.task, "actionItem");
    const error = { formErrors: ["failed"], fieldErrors: {} };
    actions.updateCompanyAction.mockResolvedValue({ ok: false, error });

    await store.onSubmit();

    expect(rootStore.terminologyStore.refresh).not.toHaveBeenCalled();
    expect(store.form.terminology.task).toBe("actionItem");
    expect(store.hasUnsavedChanges).toBe(true);
    expect(store.error).toEqual(error);
  });
});

describe("CompanySettingsStore pipeline totals", () => {
  const COLUMN_ID = "column-stage";
  const OPEN = "option-open";
  const WON = "option-won";

  function storeWithSums(sums: Record<string, Record<string, number>>) {
    const store = new CompanySettingsStore(makeRootStore());

    store.applyDealStageColumns(
      [
        {
          id: COLUMN_ID,
          label: "Status",
          options: [
            { value: OPEN, label: "Open", color: "warning", isDefault: true, index: 0, weight: 30 },
            { value: WON, label: "Won", color: "success", isDefault: false, index: 1, weight: 100 },
          ],
        },
      ] as never,
      COLUMN_ID,
    );
    store.applyStageValueSums(COLUMN_ID, sums);

    return store;
  }

  it("adds up the deal value column the interactor actually returns", () => {
    const store = storeWithSums({
      [OPEN]: { totalValue: 725500, weightedValue: 217650 },
      [WON]: { totalValue: 545500, weightedValue: 545500 },
    });

    expect(store.pipelineTotal).toBe(1271000);
    expect(store.weightedPipelineTotal).toBe(725500 * 0.3 + 545500);
  });

  it("counts stageless deals in the total while leaving them unweighted", () => {
    const store = storeWithSums({
      [OPEN]: { totalValue: 100000, weightedValue: 30000 },
      __empty__: { totalValue: 418500 },
    });

    expect(store.unweightedPipelineTotal).toBe(418500);
    expect(store.pipelineTotal).toBe(518500);
    expect(store.weightedPipelineTotal).toBe(30000);
  });

  it("reports nothing rather than zero when no sums have arrived", () => {
    const store = new CompanySettingsStore(makeRootStore());

    expect(store.pipelineTotal).toBe(0);
    expect(store.weightedPipelineTotal).toBe(0);
  });
});
