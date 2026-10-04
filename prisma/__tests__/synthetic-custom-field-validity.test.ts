import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it } from "vitest";

import { normalizeRecordScalar } from "@/features/records/record-write.service";
import { legacyFieldScalar } from "../seeds/legacy-conversion/v2/legacy-model";
import { SEED_IDS } from "../seeds/context";
import { seedCustomFields } from "../seeds/custom-fields";
import { syntheticRecordModel } from "../seeds/records";

// The synthetic seed writes custom-field values that the application re-validates on every
// write (`ContactWritePrecheckInteractor` and siblings run `validateCustomFieldValues`). If a
// seeded value does not pass its own column-type validator, every save of that record is
// rejected server-side — e.g. a "Phones" value like "+1 202-555-0100" fails `z.e164()` and
// blocks even an unrelated first-name edit. This test drives the real seed generator and the
// real validators so that class of drift fails in CI instead of silently in the product.

function context(prisma: PrismaClient) {
  return {
    prisma,
    ids: SEED_IDS,
    seedUserEmail: "max.bergmann@customermates.com",
    sharedUserPassword: "local-demo-password",
  };
}

function entities() {
  const organizations = Array.from({ length: 19 }, (_, index) => ({
    id: `organization-${index}`,
    website: `https://company-${index}.example`,
  }));
  const contacts = Array.from({ length: 30 }, (_, index) => ({ id: `contact-${index}` }));
  const deals = Array.from({ length: 10 }, (_, index) => ({ id: `deal-${index}` }));
  const services = Array.from({ length: 43 }, (_, index) => ({ id: `service-${index}`, amount: index + 1 }));
  const tasks = Array.from({ length: 15 }, (_, index) => ({ id: `task-${index}` }));

  return {
    organizations,
    contacts,
    deals,
    services,
    tasks,
    // Only the singleSelect option index (deal[3] / task[5]) is read for custom-field seeding.
    dealDefinitions: deals.map(() => ["Deal", 0, [], 0]),
    taskDefinitions: tasks.map(() => ["Task", [], [], [], [], 0]),
  };
}

describe("synthetic seed custom-field values", () => {
  it("every seeded value passes its column-type validator", async () => {
    const ctx = context({} as PrismaClient);
    const fields = await seedCustomFields(ctx, entities() as never);
    const { model } = syntheticRecordModel(ctx, fields);
    expect(fields.customColumns?.length).toBeGreaterThan(0);
    expect(fields.customFieldValues?.length).toBeGreaterThan(0);
    for (const row of fields.customFieldValues ?? []) {
      const field = model.fields.find((field) => field.id === row.columnId);
      expect(field).toBeDefined();
      if (!field) throw new Error("Seed field is missing");
      expect(() => normalizeRecordScalar(legacyFieldScalar(row.value, field, "EUR"), field), field.label).not.toThrow();
    }
  });
});
