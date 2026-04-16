import type { P13nEntry, SavedFilterPreset } from "./prisma-p13n.repository";
import type { Data } from "@/core/validation/validation.utils";

import { randomUUID } from "crypto";

import { z } from "zod";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { FilterSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";

const Schema = z.object({
  p13nId: z.string().min(1),
  presetId: z.uuid().optional(),
  name: z.string().min(1).max(100),
  filters: z.array(FilterSchema),
});

export type UpsertFilterPresetData = Data<typeof Schema>;

const P13nEntrySchema = z.object({
  p13nId: z.string(),
  filters: z.array(z.any()).optional(),
  savedFilterPresets: z.array(z.any()).optional(),
  searchTerm: z.string().optional(),
  sortDescriptor: z.any().optional(),
  pagination: z.any().optional(),
  columnWidths: z.record(z.string(), z.number()).optional(),
  columnOrder: z.array(z.string()).optional(),
  hiddenColumns: z.array(z.string()).optional(),
  viewMode: z.string().optional(),
  groupingColumnId: z.string().optional(),
});

export abstract class UpsertFilterPresetRepo {
  abstract getP13n(p13nId: string): Promise<P13nEntry | undefined>;
  abstract upsertP13n(data: { p13nId: string; savedFilterPresets: SavedFilterPreset[] }): Promise<P13nEntry>;
}

@TentantInteractor()
export class UpsertFilterPresetInteractor extends BaseInteractor<UpsertFilterPresetData, P13nEntry> {
  constructor(private repo: UpsertFilterPresetRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(P13nEntrySchema)
  @Transaction
  async invoke(data: UpsertFilterPresetData): Validated<P13nEntry> {
    const p13nData = await this.repo.getP13n(data.p13nId);
    const existingPresets = p13nData?.savedFilterPresets ?? [];

    let updatedPresets: SavedFilterPreset[];

    if (data.presetId) {
      const presetIndex = existingPresets.findIndex((p) => p.id === data.presetId);
      const presetExists = presetIndex >= 0;

      if (!presetExists) throw new Error("Preset not found");

      updatedPresets = [...existingPresets];
      updatedPresets[presetIndex] = {
        ...updatedPresets[presetIndex],
        name: data.name,
        filters: data.filters,
      };
    } else {
      const newPreset: SavedFilterPreset = {
        id: randomUUID(),
        name: data.name,
        filters: data.filters,
      };
      updatedPresets = [...existingPresets, newPreset];
    }

    const res = await this.repo.upsertP13n({
      p13nId: data.p13nId,
      savedFilterPresets: updatedPresets,
    });

    return { ok: true as const, data: res };
  }
}
