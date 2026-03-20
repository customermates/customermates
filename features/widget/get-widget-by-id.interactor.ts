import { z } from "zod";

import { ExtendedWidget } from "./widget.types";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { Data } from "@/core/validation/validation.utils";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

const Schema = z.object({
  id: z.uuid(),
});
export type GetWidgetByIdData = Data<typeof Schema>;

export abstract class GetWidgetByIdRepo {
  abstract getWidgetById(id: string): Promise<ExtendedWidget | null>;
}

@AllowInDemoMode
@TentantInteractor()
export class GetWidgetByIdInteractor {
  constructor(private repo: GetWidgetByIdRepo) {}

  @Enforce(Schema)
  async invoke(data: GetWidgetByIdData): Promise<ExtendedWidget | null> {
    return await this.repo.getWidgetById(data.id);
  }
}
