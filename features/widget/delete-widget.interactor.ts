import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { Data } from "@/core/validation/validation.utils";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";

const Schema = z.object({
  id: z.uuid(),
});
export type DeleteWidgetData = Data<typeof Schema>;

export abstract class DeleteWidgetRepo {
  abstract deleteWidget(id: string): Promise<void>;
}

@TentantInteractor()
export class DeleteWidgetInteractor {
  constructor(private repo: DeleteWidgetRepo) {}

  @Enforce(Schema)
  async invoke(data: DeleteWidgetData): Promise<string> {
    return await this.repo.deleteWidget(data.id).then(() => data.id);
  }
}
