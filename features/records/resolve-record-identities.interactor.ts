import { RecordIdentityReader } from "./record-identity-reader";
import { z } from "zod";
import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import { RecordIdentityReferenceSchema } from "./record-identity-reference.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordIdentityInputSchema } from "./record-identity.schema";
import { recordWriteFailure } from "./mutate-record.interactor";

export const ResolveRecordIdentitiesSchema = z
  .object({
    identifiers: z.array(RecordIdentityInputSchema.pick({ provider: true, value: true })).max(1000),
    typeIds: z.array(z.uuid()).max(100).optional(),
  })
  .strict();
type Input = z.infer<typeof ResolveRecordIdentitiesSchema>;
export const ResolveRecordIdentitiesResultSchema = z
  .object({
    matches: z.array(
      RecordIdentityInputSchema.pick({ provider: true, value: true })
        .extend({ records: z.array(RecordIdentityReferenceSchema) })
        .strict(),
    ),
  })
  .strict();
type Output = z.infer<typeof ResolveRecordIdentitiesResultSchema>;

@AllowInDemoMode
@TenantInteractor()
export class ResolveRecordIdentitiesInteractor extends AuthenticatedInteractor<Input, Output> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(ResolveRecordIdentitiesSchema)
  async invoke(input: Input): Validated<Output> {
    return runInTransaction(
      async () => {
        const policy = await this.policy.load();
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        try {
          return {
            ok: true,
            data: {
              matches: await new RecordIdentityReader(this.records, this.policy).resolve(
                input.identifiers,
                input.typeIds,
              ),
            },
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
