import type { DryRunImportData } from "@/features/data-transfer/data-transfer.schema";
import type { PrecheckFn } from "@/core/validation/run-precheck";
import type { Validated } from "@/core/validation/validation.utils";
import type { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getZodParseContext } from "@/core/validation/zod-error-map-server";
import { runPrecheck } from "@/core/validation/run-precheck";

export type BulkWritePrecheck = {
  createMany: PrecheckFn<never>;
  updateMany: PrecheckFn<never>;
};

export abstract class BaseDryRunImportInteractor extends AuthenticatedInteractor<DryRunImportData, null> {
  constructor(
    private collectionKey: string,
    private createSchema: z.ZodType,
    private updateSchema: z.ZodType,
    private precheck: BulkWritePrecheck,
  ) {
    super();
  }

  async invoke(data: DryRunImportData): Validated<null> {
    const schema = data.mode === "create" ? this.createSchema : this.updateSchema;
    const context = await getZodParseContext();
    const parsed = await schema.safeParseAsync({ [this.collectionKey]: data.rows }, context);

    if (!parsed.success) return { ok: false as const, error: parsed.error };

    const checked = await runPrecheck(parsed.data, (value, ctx) =>
      data.mode === "create"
        ? this.precheck.createMany(value as never, ctx)
        : this.precheck.updateMany(value as never, ctx),
    );

    if (!checked.ok) return { ok: false as const, error: checked.error };

    return { ok: true as const, data: null };
  }
}
