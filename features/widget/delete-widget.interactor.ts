import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidateWidgetIdsInteractor } from "@/core/validation/validators/validate-widget-ids.interactor";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";

const Schema = z.object({
  id: z.uuid(),
});
export type DeleteWidgetData = Data<typeof Schema>;

export abstract class DeleteWidgetRepo {
  abstract deleteWidget(id: string): Promise<void>;
}

@TenantInteractor()
export class DeleteWidgetInteractor extends AuthenticatedInteractor<DeleteWidgetData, string> {
  constructor(
    private repo: DeleteWidgetRepo,
    private validator: ValidateWidgetIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: Schema,
    output: z.string(),
    tx: false,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: DeleteWidgetData): Validated<string> {
    await this.repo.deleteWidget(data.id);
    return { ok: true as const, data: data.id };
  }
}
