import { recordChannelsEnabled } from "./record-channels";
import { z } from "zod";

import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { Validated } from "@/core/validation/validation.utils";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { fail, failAuthorization, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { channelClass } from "@/ee/messaging/provider";
import { RecordIdentityInputSchema } from "./record-identity.schema";
import { identityKeys, normalizedIdentity } from "./record-identity";

export const CheckRecordIdentitySchema = z
  .object({
    typeId: z.uuid(),
    recordId: z.uuid().optional(),
    identity: RecordIdentityInputSchema,
  })
  .strict();
export type CheckRecordIdentityInput = z.infer<typeof CheckRecordIdentitySchema>;

@AllowInDemoMode
@TenantInteractor()
export class CheckRecordIdentityInteractor extends AuthenticatedInteractor<
  CheckRecordIdentityInput,
  { available: true }
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  @Validate(CheckRecordIdentitySchema)
  async invoke(input: CheckRecordIdentityInput): Validated<{ available: true }> {
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        const type = model.types.find((type) => type.id === input.typeId && !type.archived);
        if (!policy.actor || !type || !policy.canReadType(type.id))
          return failNotFound(CustomErrorCode.recordTypeNotFound);
        if (!recordChannelsEnabled(model, type.id)) return failAuthorization(CustomErrorCode.recordProtected);
        const ref = input.recordId ? { typeId: type.id, recordId: input.recordId } : null;
        if (!policy.allowed(type.id, ref ? "update" : "create"))
          return failAuthorization(CustomErrorCode.permissionDenied);
        if (ref) {
          const record = await this.records.getRecordCompanyWide(ref);
          if (!record || !(await policy.canRead(record))) return failNotFound(CustomErrorCode.recordNotFound);
          if (record.protectedKind) return failAuthorization(CustomErrorCode.recordProtected);
        }
        const normalized = normalizedIdentity(input.identity);
        const lookup = normalized ?? input.identity;
        const known = await this.records.getIdentityChannelsCompanyWide(
          identityKeys(lookup).map((value) => ({ channelClass: channelClass(lookup.provider), value })),
        );
        if (
          !normalized &&
          !known.some(
            (identity) =>
              identity.channelClass === channelClass(lookup.provider) && identityKeys(identity).includes(lookup.value),
          )
        )
          return fail(CustomErrorCode.invalidChannelValue, ["identity", "value"]);
        if (new Set(known.map((row) => row.id)).size > 1)
          return failConflict(CustomErrorCode.channelAlreadyLinked, ["identity"]);
        return { ok: true, data: { available: true } };
      },
      { readOnly: true },
    );
  }
}
