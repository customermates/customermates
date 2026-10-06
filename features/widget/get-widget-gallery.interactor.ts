import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordAccessPolicy } from "@/features/records/record-access";
import type { Validated } from "@/core/validation/validation.utils";
import type { WidgetGallery } from "./widget-gallery";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { recordMeasureIssue } from "@/features/records/record-measure-validation";
import { getTranslator } from "@/i18n/get-translator";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { widgetDisplayTypeIssue } from "./widget-display-rules";
import { WidgetGallerySchema, resolveWidgetGallery } from "./widget-gallery";

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetGalleryInteractor extends AuthenticatedInteractor<void, WidgetGallery> {
  constructor(
    private records: RecordRepo,
    private policy: RecordAccessPolicy,
  ) {
    super();
  }

  async invoke(): Validated<WidgetGallery> {
    const translators = await Promise.all(APP_LOCALES.map((locale) => getTranslator(locale)));
    const closedLabels = translators.flatMap((t) => [
      t("Common.defaultData.task.options.done"),
      t("Common.defaultData.task.options.archived"),
    ]);
    return runInTransaction(
      async () => {
        const [model, policy] = await Promise.all([this.records.getModel(), this.policy.load()]);
        if (!policy.actor) return failAuthorization(CustomErrorCode.permissionDenied);
        const readable = (typeId: string) => policy.allowed(typeId, "readAll") || policy.allowed(typeId, "readOwn");
        const templates = resolveWidgetGallery(model, closedLabels).filter((template) => {
          const measure = template.measure;
          let typeId = measure.source.typeId;
          const types = [typeId];
          for (const step of measure.groupBy?.path ?? []) {
            const relation = model.relationships.find((relation) => relation.id === step.relationId);
            if (!relation) return false;
            typeId = step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
            types.push(typeId);
          }
          return (
            types.every(readable) &&
            !recordMeasureIssue(measure, model) &&
            !widgetDisplayTypeIssue(template.displayOptions.displayType, measure, model)
          );
        });
        return {
          ok: true as const,
          data: WidgetGallerySchema.parse({ schemaRevision: model.revision, templates }),
        };
      },
      { readOnly: true },
    );
  }
}
