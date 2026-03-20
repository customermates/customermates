import { randomUUID } from "crypto";

import { z } from "zod";

import { P13nEntry, SavedFilterPreset } from "./prisma-p13n.repository";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { FilterSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";

const Schema = z.object({
  p13nId: z.string().min(1),
  presetId: z.uuid().optional(),
  name: z.string().min(1).max(100),
  filters: z.array(FilterSchema),
});

export type UpsertFilterPresetData = Data<typeof Schema>;

export abstract class UpsertFilterPresetRepo {
  abstract getP13n(p13nId: string): Promise<P13nEntry | undefined>;
  abstract upsertP13n(data: { p13nId: string; savedFilterPresets: SavedFilterPreset[] }): Promise<P13nEntry>;
}

@TentantInteractor()
export class UpsertFilterPresetInteractor {
  constructor(private repo: UpsertFilterPresetRepo) {}

  @Validate(Schema)
  @Transaction
  async invoke(data: UpsertFilterPresetData): Validated<P13nEntry, UpsertFilterPresetData> {
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

    return { ok: true, data: res };
  }
}
