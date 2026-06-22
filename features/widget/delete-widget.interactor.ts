import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { validateWidgetIds } from "@/core/validation/ids-validators";
import { getWidgetRepo } from "@/core/di";

const Schema = z
  .object({
    id: z.uuid(),
  })
  .superRefine(async (data, ctx) => {
    const validIdsSet = await getWidgetRepo().findIds(new Set([data.id]));
    validateWidgetIds(data.id, validIdsSet, ctx, ["id"]);
  });
export type DeleteWidgetData = Data<typeof Schema>;

export abstract class DeleteWidgetRepo {
  abstract deleteWidget(id: string): Promise<void>;
}

@TenantInteractor()
export class DeleteWidgetInteractor extends AuthenticatedInteractor<DeleteWidgetData, string> {
  constructor(private repo: DeleteWidgetRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(z.string())
  async invoke(data: DeleteWidgetData): Validated<string> {
    await this.repo.deleteWidget(data.id);
    return { ok: true as const, data: data.id };
  }
}
