import type { DataViewDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type { ApplyDataViewOverrideData, DataViewOverrideResult } from "./data-view.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { diffDataViewState, resolveDataViewState } from "@/core/data-view/resolve-data-view-state";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ApplyDataViewOverrideSchema, DataViewOverrideResultSchema } from "./data-view.schema";

export abstract class DataViewOverrideWriteRepo {
  abstract upsertOverride(args: { surfaceKey: string; viewKey: string; delta: DataViewState }): Promise<void>;
  abstract deleteOverride(args: { surfaceKey: string; viewKey: string }): Promise<boolean>;
}

export abstract class ReadableDataViewRepo {
  abstract findViewById(id: string): Promise<DataViewDto | null>;
}

@TenantInteractor()
export class ApplyDataViewOverrideInteractor extends AuthenticatedInteractor<
  ApplyDataViewOverrideData,
  DataViewOverrideResult
> {
  constructor(
    private views: ReadableDataViewRepo,
    private overrides: DataViewOverrideWriteRepo,
  ) {
    super();
  }

  @Enforce(ApplyDataViewOverrideSchema)
  @Transaction
  @ValidateOutput(DataViewOverrideResultSchema)
  async invoke({ surfaceKey, viewKey, mode, state }: ApplyDataViewOverrideData): Validated<DataViewOverrideResult> {
    if (mode === "reset") {
      await this.overrides.deleteOverride({ surfaceKey, viewKey });

      return { ok: true as const, data: { hasOverride: false } };
    }

    let view: DataViewDto | null = null;

    if (viewKey !== ALL_VIEW_KEY) {
      view = await this.views.findViewById(viewKey);

      if (!view) return failNotFound(CustomErrorCode.dataViewNotFound, ["viewKey"]);
    }

    const base = resolveDataViewState({ params: {}, override: undefined, view: view?.state, defaults: {} });
    const delta = diffDataViewState(state ?? {}, base);

    if (Object.keys(delta).length === 0) {
      await this.overrides.deleteOverride({ surfaceKey, viewKey });

      return { ok: true as const, data: { hasOverride: false } };
    }

    await this.overrides.upsertOverride({ surfaceKey, viewKey, delta });

    return { ok: true as const, data: { hasOverride: true } };
  }
}
