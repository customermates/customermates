import type { z } from "zod";

import type { Validated } from "@/core/validation/validation.utils";
import type { DataViewPolicy } from "./data-view-policy";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import {
  ResetDataViewStateSchema,
  ResetDataViewStateResultSchema,
  type ResetDataViewStateInput,
} from "./reset-data-view-state.schema";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export interface ResetDataViewStateRepo {
  resetOwnedViewState(input: ResetDataViewStateInput): Promise<boolean>;
}

@TenantInteractor()
export class ResetDataViewStateInteractor extends AuthenticatedInteractor<
  ResetDataViewStateInput,
  z.infer<typeof ResetDataViewStateResultSchema>
> {
  constructor(
    private repo: ResetDataViewStateRepo,
    private policy: DataViewPolicy,
  ) {
    super();
  }
  @Write({ input: ResetDataViewStateSchema, output: ResetDataViewStateResultSchema })
  async invoke(input: ResetDataViewStateInput): Validated<z.infer<typeof ResetDataViewStateResultSchema>> {
    const invalid = await this.policy.validate(input.surfaceKey);
    if (invalid) return fail(invalid);
    if (!(await this.repo.resetOwnedViewState(input))) return failNotFound(CustomErrorCode.dataViewNotFound);
    return { ok: true, data: { viewKey: input.viewKey } };
  }
}
