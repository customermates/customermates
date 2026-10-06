import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { Validated } from "@/core/validation/validation.utils";

import { createCrmPreset } from "./crm-preset";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const RecordModelOverviewSchema = z
  .object({
    types: z.array(
      z
        .object({
          id: z.uuid(),
          standard: z.boolean(),
          recordCount: z.number().int().nonnegative().nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export type RecordModelOverview = z.infer<typeof RecordModelOverviewSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetRecordModelOverviewInteractor extends AuthenticatedInteractor<void, RecordModelOverview> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  async invoke(): Validated<RecordModelOverview> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const readable = model.types
          .filter(
            (type) => !type.archived && (policy.allowed(type.id, "readAll") || policy.allowed(type.id, "readOwn")),
          )
          .map((type) => type.id);
        const visible = model.types.filter(
          (type) =>
            policy.canManageSchema ||
            policy.canManageRoles ||
            policy.allowed(type.id, "readAll") ||
            policy.allowed(type.id, "readOwn"),
        );
        const counts = new Map(
          (await this.records.countReadableRecordsByType(policy.access(readable))).map((row) => [
            row.typeId,
            row.count,
          ]),
        );
        const presets = new Set(createCrmPreset(this.companyId, "EUR").types.map((type) => type.id));
        return {
          ok: true as const,
          data: {
            types: visible.map((type) => ({
              id: type.id,
              standard: presets.has(type.id),
              recordCount: readable.includes(type.id) ? (counts.get(type.id) ?? 0) : null,
            })),
          },
        };
      },
      { readOnly: true },
    );
  }
}
