import { describe, expect, it } from "vitest";

import { presetId } from "@/features/records/crm-preset";
import { normalizeRecordScalar } from "@/features/records/record-write.service";
import { seedContacts } from "../seeds/contacts";
import { SEED_IDS, type SeedContext } from "../seeds/context";
import { seedCustomFields } from "../seeds/custom-fields";
import { seedDeals } from "../seeds/deals";
import { buildNorthwindRecords } from "../seeds/northwind-records";
import { seedOrganizations } from "../seeds/organizations";
import { syntheticRecordModel } from "../seeds/records";
import { seedServices } from "../seeds/services";
import { seedTasks } from "../seeds/tasks";

const context = { ids: SEED_IDS } as SeedContext;

describe("synthetic seed custom-field values", () => {
  it("every seeded value passes its field-type validator", async () => {
    const organizations = await seedOrganizations(context);
    const contacts = await seedContacts(context, organizations.organizations);
    const services = await seedServices(context);
    const deals = await seedDeals(context, services);
    const tasks = await seedTasks(context);
    const fields = seedCustomFields(context, { ...organizations, ...contacts, ...services, ...deals, ...tasks });
    const model = syntheticRecordModel(context, fields);
    const values = [
      ...fields.customFieldValues.map((row) => ({ fieldId: row.fieldId, value: row.value })),
      ...buildNorthwindRecords(SEED_IDS.company).values.map((row) => ({
        fieldId: presetId(SEED_IDS.company, row.fieldKey),
        value: row.value,
      })),
    ];
    expect(fields.customFieldValues.length).toBeGreaterThan(0);
    expect(values.length).toBeGreaterThan(fields.customFieldValues.length);
    for (const row of values) {
      const field = model.fields.find((candidate) => candidate.id === row.fieldId);
      expect(field, row.fieldId).toBeDefined();
      if (!field) throw new Error("Seed field is missing");
      expect(["input", "snapshot"], field.label).toContain(field.behavior.kind);
      expect(() => normalizeRecordScalar(row.value, field), field.label).not.toThrow();
    }
  });
});
