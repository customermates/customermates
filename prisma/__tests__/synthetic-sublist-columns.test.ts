import type { SeedContext } from "../seeds/context";

import { describe, expect, it, vi } from "vitest";

import { p13nSettingsSchema } from "@/features/p13n/p13n-settings.schema";
import { sublistColumnsP13nId } from "@/features/p13n/sublist-columns.schema";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";

import { SEED_IDS } from "../seeds/context";
import { NORTHWIND_MEMBER_IDS } from "../seeds/northwind-model";
import { applyNorthwindModel } from "../seeds/northwind-schema";
import { northwindSublistColumns, seedSublistColumns } from "../seeds/sublist-columns";

const companyId = SEED_IDS.company;
const model = applyNorthwindModel(createCrmPreset(companyId), companyId);
const labels = (member: keyof typeof NORTHWIND_MEMBER_IDS) =>
  northwindSublistColumns(companyId, member).columns.map(
    (column) => model.fields.find((field) => field.id === column)?.label,
  );

describe("synthetic sub-list columns", () => {
  it("gives Max a lean Line items list next to the always-shown name", () => {
    const lineItems = model.types.find((type) => type.id === presetId(companyId, "lineItem"));
    expect(lineItems?.parentRelationshipId).toBeTruthy();
    expect(model.fields.find((field) => field.id === lineItems?.primaryFieldId)?.label).toBe("Name");
    expect(labels("maxBergmann")).toEqual(["Quantity", "Unit price", "Amount"]);
  });

  it("adds the discount for the sales team and stores only valid, existing line item columns", () => {
    for (const member of ["sofiaRossi", "claraNeumann", "marcoSilva"] as const)
      expect(labels(member)).toEqual(["Quantity", "Unit price", "Discount %", "Amount"]);
    const p13nId = sublistColumnsP13nId(presetId(companyId, "lineItem"));
    for (const member of Object.keys(NORTHWIND_MEMBER_IDS) as (keyof typeof NORTHWIND_MEMBER_IDS)[]) {
      const settings = northwindSublistColumns(companyId, member);
      expect(p13nSettingsSchema(p13nId)?.parse(settings)).toEqual(settings);
      expect(labels(member).every(Boolean)).toBe(true);
    }
  });

  it("stores one personal choice per seeded member and converges on reseed", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const context = { ids: { company: companyId }, prisma: { p13n: { upsert } } } as unknown as SeedContext;
    await seedSublistColumns(context);
    await seedSublistColumns(context);
    const members = Object.values(NORTHWIND_MEMBER_IDS);
    expect(upsert).toHaveBeenCalledTimes(members.length * 2);
    const first = upsert.mock.calls.slice(0, members.length).map(([args]) => args);
    const second = upsert.mock.calls.slice(members.length).map(([args]) => args);
    expect(second).toEqual(first);
    expect(first.map((args) => args.create.userId)).toEqual(members);
    expect(new Set(first.map((args) => args.create.id)).size).toBe(members.length);
    expect(first.every((args) => args.create.p13nId === sublistColumnsP13nId(presetId(companyId, "lineItem")))).toBe(
      true,
    );
  });
});
