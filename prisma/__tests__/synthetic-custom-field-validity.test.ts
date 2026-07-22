import type { PrismaClient } from "@/generated/prisma";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { z } from "zod";

import { describe, expect, it, vi } from "vitest";

import { validateCustomFieldValues } from "@/core/validation/validate-custom-field-values";

import { seedCustomFields } from "../seeds/custom-fields";
import { SEED_IDS } from "../seeds/context";

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

function captureUpsert<T>() {
  const created: T[] = [];
  const delegate = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    upsert: vi.fn(({ create }: { create: T }) => {
      created.push(create);
      return Promise.resolve(create);
    }),
  };
  return { created, delegate };
}

describe("synthetic seed custom-field values", () => {
  it("every seeded value passes its column-type validator", async () => {
    const columns = captureUpsert<CustomColumnDto>();
    const values = captureUpsert<{ columnId: string; value: string | null }>();

    const prisma = {
      customColumn: columns.delegate,
      customFieldValue: values.delegate,
    } as unknown as PrismaClient;

    await seedCustomFields(context(prisma), entities() as never);

    expect(columns.created.length).toBeGreaterThan(0);
    expect(values.created.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const row of values.created) {
      const issues: unknown[] = [];
      const ctx = { addIssue: (issue: unknown) => issues.push(issue) } as unknown as z.RefinementCtx;

      validateCustomFieldValues([{ columnId: row.columnId, value: row.value }], columns.created, ctx, ["value"]);

      if (issues.length > 0) {
        const column = columns.created.find((candidate) => candidate.id === row.columnId);
        failures.push(`${column?.label ?? row.columnId} (${column?.type ?? "unknown"}) = ${JSON.stringify(row.value)}`);
      }
    }

    expect(failures, `Seeded custom-field values rejected by their own validators:\n${failures.join("\n")}`).toEqual(
      [],
    );
  });
});
