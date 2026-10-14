import type { Data, Validated } from "@/core/validation/validation.utils";
import type { UpdateThreadInteractor } from "./update-thread.interactor";

import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

import { UpdateThreadStateSchema } from "./update-thread.interactor";

const Schema = UpdateThreadStateSchema.strict();
type UpdateThreadStateData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class UpdateThreadStateInteractor extends AuthenticatedInteractor<UpdateThreadStateData, UpdateThreadStateData> {
  constructor(private updateThread: UpdateThreadInteractor) {
    super();
  }

  @Validate(Schema)
  async invoke(data: UpdateThreadStateData): Validated<UpdateThreadStateData> {
    const result = await this.updateThread.invoke(data);
    if (!result.ok) return result;

    return { ok: true as const, data: { threadId: data.threadId, state: data.state } };
  }
}
