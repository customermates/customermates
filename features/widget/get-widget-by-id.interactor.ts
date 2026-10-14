import type { WidgetDto } from "./widget.schema";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { GetWidgetByIdRepo } from "./get-widget-by-id.repo";
import type { WidgetDtoReader } from "./widget-dto-reader";

import { z } from "zod";

import { WidgetDtoSchema } from "./widget.schema";

import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  id: z.uuid(),
});
export type GetWidgetByIdData = Data<typeof Schema>;

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetByIdInteractor extends AuthenticatedInteractor<GetWidgetByIdData, WidgetDto | null> {
  constructor(
    private repo: GetWidgetByIdRepo,
    private widgets: WidgetDtoReader,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(WidgetDtoSchema)
  async invoke(data: GetWidgetByIdData): Validated<WidgetDto | null> {
    return runInTransaction(
      async () => {
        const stored = await this.repo.getWidgetById(data.id);
        return { ok: true as const, data: stored ? await this.widgets.read(stored) : null };
      },
      { readOnly: true, timeout: 30000 },
    );
  }
}
