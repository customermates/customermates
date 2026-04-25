import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Locale, Theme } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { BaseInteractor } from "@/core/base/base-interactor";

const Schema = z.object({
  theme: z.enum(Theme),
  displayLanguage: z.enum(Locale),
  formattingLocale: z.enum(Locale),
});
export type UpdateUserSettingsData = Data<typeof Schema>;

export abstract class UpdateUserSettingsRepo {
  abstract updateSettings(args: UpdateUserSettingsData): Promise<UpdateUserSettingsData>;
}

@TentantInteractor()
export class UpdateUserSettingsInteractor extends BaseInteractor<UpdateUserSettingsData, UpdateUserSettingsData> {
  constructor(private repo: UpdateUserSettingsRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(Schema)
  async invoke(data: UpdateUserSettingsData): Validated<UpdateUserSettingsData> {
    return { ok: true as const, data: await this.repo.updateSettings(data) };
  }
}
