import type { MembershipTaskService } from "./membership-task.service";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { unwoundFailure } from "@/core/validation/interactor-failure-server";

@AllowInDemoMode
@TenantInteractor()
export class CountSystemTasksInteractor extends AuthenticatedInteractor<void, number> {
  constructor(private tasks: Pick<MembershipTaskService, "getSystemTasksCount">) {
    super();
  }

  @ValidateOutput(z.number())
  async invoke(): Validated<number> {
    return this.tasks
      .getSystemTasksCount()
      .then((data) => ({ ok: true as const, data }))
      .catch(unwoundFailure);
  }
}
