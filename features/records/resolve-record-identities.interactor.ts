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
    identifiers: z
      .array(RecordIdentityInputSchema.pick({ provider: true, value: true }))
      .max(1000)
      .describe("Up to 1,000 exact channel identifiers. Each input, including a repeated one, returns its own match."),
    typeIds: z.array(z.uuid()).max(100).optional(),
  })
  .strict();
type Input = z.infer<typeof ResolveRecordIdentitiesSchema>;
export const ResolveRecordIdentitiesResultSchema = z
  .object({
    schemaRevision: z
      .number()
      .int()
      .nonnegative()
      .describe("Workspace schema revision for expectedRevision in a following record mutation."),
    matches: z.array(
      RecordIdentityInputSchema.pick({ provider: true, value: true })
        .extend({
          records: z.array(
            RecordIdentityReferenceSchema.extend({
              version: z
                .number()
                .int()
                .positive()
                .describe("Current record version for expectedVersion in an updateMany target."),
            }).strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict()
  .describe(
    "matches follow the input order. A record linked through several identifiers appears under each of them: deduplicate by typeId and recordId before building updateMany targets. Resolve every input with more than one record before updating; never pick one arbitrarily.",
  );
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
            data: await new RecordIdentityReader(this.records, this.policy).resolveForUpdate(
              input.identifiers,
              input.typeIds,
            ),
          };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
