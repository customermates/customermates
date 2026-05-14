import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  id: z.uuid(),
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

  @Enforce(Schema)
  @ValidateOutput(z.string())
  async invoke(data: DeleteWidgetData): Promise<{ ok: true; data: string }> {
    await this.repo.deleteWidget(data.id);
    return { ok: true as const, data: data.id };
  }
}
