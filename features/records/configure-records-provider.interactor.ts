import { z } from "zod";

import type { Validated } from "@/core/validation/validation.utils";
import type { ConfigurationPreview } from "./configuration.schema";
import type { RecordOperationResult } from "./record-query.schema";
import type {
  ApplyRecordConfigurationInteractor,
  PreviewRecordConfigurationInteractor,
} from "./configure-records.interactor";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ConfigurationChangeSchema } from "./configuration.schema";
import { decodeCalculationProgram, ProviderConfigurationChangeSchema } from "./configuration-provider.schema";

export const ConfigureRecordsProviderSchema = z
  .object({
    action: z.enum(["preview", "apply"]),
    change: ProviderConfigurationChangeSchema,
  })
  .strict();

@TenantInteractor()
export class ConfigureRecordsProviderInteractor extends AuthenticatedInteractor<
  z.infer<typeof ConfigureRecordsProviderSchema>,
  ConfigurationPreview | RecordOperationResult
> {
  constructor(
    private preview: PreviewRecordConfigurationInteractor,
    private apply: ApplyRecordConfigurationInteractor,
  ) {
    super();
  }

  @Validate(ConfigureRecordsProviderSchema)
  async invoke(
    input: z.infer<typeof ConfigureRecordsProviderSchema>,
  ): Validated<ConfigurationPreview | RecordOperationResult> {
    const operations = [];
    for (const operation of input.change.operations) {
      if (operation.operation !== "putField" || operation.field.behavior.kind === "input") {
        operations.push(operation);
        continue;
      }
      const expression = decodeCalculationProgram(operation.field.behavior.expression);
      if (!expression) return fail(CustomErrorCode.recordConfigurationInvalid);
      operations.push({
        ...operation,
        field: {
          ...operation.field,
          behavior: { ...operation.field.behavior, expression },
        },
      });
    }
    const change = ConfigurationChangeSchema.safeParse({
      ...input.change,
      operations,
    });
    if (!change.success) return { ok: false, error: change.error };
    return input.action === "preview" ? this.preview.invoke(change.data) : this.apply.invoke(change.data);
  }
}
