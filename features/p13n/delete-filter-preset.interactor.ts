import type { P13nEntry, SavedFilterPreset } from "./prisma-p13n.repository";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { P13nEntrySchema } from "./p13n.schema";
import { createInteractorFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({
  p13nId: z.string().min(1),
  presetId: z.uuid(),
});

export type DeleteFilterPresetData = Data<typeof Schema>;

export abstract class DeleteFilterPresetRepo {
  abstract getP13n(p13nId: string): Promise<P13nEntry | undefined>;
  abstract upsertP13n(data: { p13nId: string; savedFilterPresets: SavedFilterPreset[] }): Promise<P13nEntry>;
}

@TenantInteractor()
export class DeleteFilterPresetInteractor extends AuthenticatedInteractor<DeleteFilterPresetData, P13nEntry> {
  constructor(private repo: DeleteFilterPresetRepo) {
    super();
  }

  @Enforce(Schema)
  @Transaction
  @ValidateOutput(P13nEntrySchema)
  async invoke(data: DeleteFilterPresetData): Validated<P13nEntry> {
    const p13nData = await this.repo.getP13n(data.p13nId);
    const existingPresets = p13nData?.savedFilterPresets ?? [];

    if (existingPresets.findIndex((p) => p.id === data.presetId) < 0)
      return createInteractorFailure(CustomErrorCode.presetNotFound, ["presetId"]);

    const updatedPresets = existingPresets.filter((p) => p.id !== data.presetId);

    const res = await this.repo.upsertP13n({
      p13nId: data.p13nId,
      savedFilterPresets: updatedPresets,
    });

    return { ok: true as const, data: res };
  }
}
