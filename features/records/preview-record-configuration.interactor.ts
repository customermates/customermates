import type { RecordRepo } from "./record.repo";
import type { RecordAccessPolicy } from "./record-access";
import type { ConfigurationChange, ConfigurationPreview } from "./configuration.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ConfigurationChangeSchema } from "./configuration.schema";
import { type RecordConfigurationService } from "./configuration.service";
import { recordWriteFailure } from "./mutate-record.interactor";

@AllowInDemoMode
@TenantInteractor()
export class PreviewRecordConfigurationInteractor extends AuthenticatedInteractor<
  ConfigurationChange,
  ConfigurationPreview
> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
    private configurations: RecordConfigurationService,
  ) {
    super();
  }
  @Validate(ConfigurationChangeSchema)
  async invoke(input: ConfigurationChange): Validated<ConfigurationPreview> {
    return runInTransaction(
      async () => {
        try {
          const prepared = await this.configurations.prepare(
            input,
            await this.records.getModel(),
            await this.policy.load(),
          );
          for (const relationId of await this.records.validateRelationshipCardinality(prepared.model)) {
            prepared.preview.issues.push({
              code: "cardinality_conflict",
              relationId,
            });
          }
          prepared.preview.valid = !prepared.preview.issues.length;
          return { ok: true as const, data: prepared.preview };
        } catch (error) {
          return recordWriteFailure(error);
        }
      },
      { readOnly: true },
    );
  }
}
