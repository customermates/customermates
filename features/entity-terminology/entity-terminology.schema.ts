import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";

import { isConfigurableTerminologyEntityType, terminologyPresetKeys } from "./entity-terminology.constants";

export const EntityTerminologyOverrideSchema = z.object({
  entityType: z.enum(EntityType),
  presetKey: z.string(),
});

export const EntityTerminologyEntrySchema = z
  .object({
    entityType: z.enum(EntityType),
    presetKey: z.string(),
  })
  .superRefine((entry, ctx) => {
    if (
      !isConfigurableTerminologyEntityType(entry.entityType) ||
      !terminologyPresetKeys(entry.entityType).includes(entry.presetKey)
    )
      ctx.addIssue({ code: "custom", params: { error: CustomErrorCode.terminologyInvalidPreset } });
  });

export const UpsertEntityTerminologySchema = z.object({ entries: z.array(EntityTerminologyEntrySchema).min(1) });

export type UpsertEntityTerminologyData = Data<typeof UpsertEntityTerminologySchema>;
export type EntityTerminologyEntry = UpsertEntityTerminologyData["entries"][number];
