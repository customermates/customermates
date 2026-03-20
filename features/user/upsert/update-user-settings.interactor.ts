import { z } from "zod";

import { Locale, Theme } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { Data, type Validated } from "@/core/validation/validation.utils";

const Schema = z.object({
  theme: z.enum(Theme),
  displayLanguage: z.enum(Locale),
  formattingLocale: z.enum(Locale),
  marketingEmails: z.boolean(),
});
export type UpdateUserSettingsData = Data<typeof Schema>;

export abstract class UpdateUserSettingsRepo {
  abstract updateSettings(args: UpdateUserSettingsData): Promise<UpdateUserSettingsData>;
}

@TentantInteractor()
export class UpdateUserSettingsInteractor {
  constructor(private repo: UpdateUserSettingsRepo) {}

  @Validate(Schema)
  async invoke(data: UpdateUserSettingsData): Validated<UpdateUserSettingsData> {
    return { ok: true, data: await this.repo.updateSettings(data) };
  }
}
