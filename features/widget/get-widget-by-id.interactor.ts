import type { WidgetDto } from "./widget.schema";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { WidgetDtoSchema } from "./widget.schema";

import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  id: z.uuid(),
});
export type GetWidgetByIdData = Data<typeof Schema>;

export abstract class GetWidgetByIdRepo {
  abstract getWidgetById(id: string): Promise<WidgetDto | null>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetByIdInteractor extends AuthenticatedInteractor<GetWidgetByIdData, WidgetDto | null> {
  constructor(private repo: GetWidgetByIdRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(WidgetDtoSchema)
  async invoke(data: GetWidgetByIdData): Validated<WidgetDto | null> {
    return { ok: true as const, data: await this.repo.getWidgetById(data.id) };
  }
}
