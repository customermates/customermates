import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import { SYNTHETIC_CUSTOM_COLUMN_IDS, SYNTHETIC_CUSTOM_OPTION_IDS } from "../seeds/custom-fields";
import { seedWidgets, SYNTHETIC_WIDGET_NAMES } from "../seeds/widgets";

describe("synthetic widget filters", () => {
  it("restores the three legacy option filters with deterministic current IDs", async () => {
    const calls: Array<{ create: Record<string, unknown> }> = [];
    const prisma = {
      widget: {
        upsert: vi.fn((input: { create: Record<string, unknown> }) => {
          calls.push(input);
          return Promise.resolve(input.create);
        }),
      },
    } as unknown as PrismaClient;
    const context = {
      prisma,
      ids: SEED_IDS,
      seedUserEmail: SYNTHETIC_SEED_USER.email,
      sharedUserPassword: "test-password",
    } satisfies SeedContext;

    await seedWidgets(context, {
      customColumnIds: SYNTHETIC_CUSTOM_COLUMN_IDS,
      customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
    });

    const widgets = calls.map(({ create }) => create);
    expect(widgets).toHaveLength(7);
    expect(widgets.map(({ name }) => name)).toEqual(SYNTHETIC_WIDGET_NAMES);
    expect(widgets.map(({ entityFilters }) => entityFilters)).toEqual([
      [
        {
          field: SYNTHETIC_CUSTOM_COLUMN_IDS.serviceType,
          operator: "in",
          value: [SYNTHETIC_CUSTOM_OPTION_IDS.serviceType.hardware],
        },
      ],
      [],
      [],
      [
        {
          field: SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus,
          operator: "notIn",
          value: [SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.abandoned],
        },
      ],
      [],
      [
        {
          field: SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus,
          operator: "notIn",
          value: [SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.abandoned],
        },
      ],
      [],
    ]);
  });
});
