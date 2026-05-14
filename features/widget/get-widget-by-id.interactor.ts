import type { ExtendedWidget } from "./widget.types";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { WidgetDtoSchema } from "./widget.schema";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  id: z.uuid(),
});
export type GetWidgetByIdData = Data<typeof Schema>;

export abstract class GetWidgetByIdRepo {
  abstract getWidgetById(id: string): Promise<ExtendedWidget | null>;
}

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetByIdInteractor extends AuthenticatedInteractor<GetWidgetByIdData, ExtendedWidget | null> {
  constructor(private repo: GetWidgetByIdRepo) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(WidgetDtoSchema)
  async invoke(data: GetWidgetByIdData): Promise<{ ok: true; data: ExtendedWidget | null }> {
    return { ok: true as const, data: await this.repo.getWidgetById(data.id) };
  }
}
