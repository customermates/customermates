import type { P13nEntry, SavedFilterPreset } from "./prisma-p13n.repository";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";

const Schema = z.object({
  p13nId: z.string().min(1),
  presetId: z.uuid(),
});

export type DeleteFilterPresetData = Data<typeof Schema>;

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

export abstract class DeleteFilterPresetRepo {
  abstract getP13n(p13nId: string): Promise<P13nEntry | undefined>;
  abstract upsertP13n(data: { p13nId: string; savedFilterPresets: SavedFilterPreset[] }): Promise<P13nEntry>;
}

@TentantInteractor()
export class DeleteFilterPresetInteractor extends BaseInteractor<DeleteFilterPresetData, P13nEntry> {
  constructor(private repo: DeleteFilterPresetRepo) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(P13nEntrySchema)
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

    return { ok: true as const, data: res };
  }
}
