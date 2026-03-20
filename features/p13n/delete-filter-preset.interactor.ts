import { z } from "zod";

import { P13nEntry, SavedFilterPreset } from "./prisma-p13n.repository";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";
import { Transaction } from "@/core/decorators/transaction.decorator";

const Schema = z.object({
  p13nId: z.string().min(1),
  presetId: z.uuid(),
});

export type DeleteFilterPresetData = Data<typeof Schema>;

export abstract class DeleteFilterPresetRepo {
  abstract getP13n(p13nId: string): Promise<P13nEntry | undefined>;
  abstract upsertP13n(data: { p13nId: string; savedFilterPresets: SavedFilterPreset[] }): Promise<P13nEntry>;
}

@TentantInteractor()
export class DeleteFilterPresetInteractor {
  constructor(private repo: DeleteFilterPresetRepo) {}

  @Enforce(Schema)
  @Transaction
  async invoke(data: DeleteFilterPresetData): Validated<P13nEntry> {
    const p13nData = await this.repo.getP13n(data.p13nId);
    const existingPresets = p13nData?.savedFilterPresets ?? [];

    const presetIndex = existingPresets.findIndex((p) => p.id === data.presetId);
    const presetExists = presetIndex >= 0;

    if (!presetExists) throw new Error("Preset not found");

    const updatedPresets = existingPresets.filter((p) => p.id !== data.presetId);

    const res = await this.repo.upsertP13n({
      p13nId: data.p13nId,
      savedFilterPresets: updatedPresets,
    });

    return { ok: true, data: res };
  }
}
