"use client";

import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";
import type { RoutineRunDto } from "@/ee/routines/routine.schema";
import type { RecordFieldView } from "@/features/records/record-model.schema";

import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { useChangeFieldLabel } from "@/components/data-view/use-column-label";
import { InfoRow } from "@/components/shared/info-row";
import { IntlLink } from "@/i18n/navigation";

type Props = {
  run: RoutineRunDto;
  customColumns?: CustomColumnDto[];
  recordFields?: RecordFieldView[];
};

export function RoutineRunTriggerCard({ run, customColumns = [], recordFields }: Props) {
  const t = useTranslations();
  const changeFieldLabel = useChangeFieldLabel();
  const context = run.triggerContext;

  return (
    <div className="space-y-1.5 rounded-lg border p-4">
      <InfoRow label={t("RoutineDetail.trigger")}>
        <AppChip size="sm" variant="secondary">
          {run.triggerEvent ? t(`Common.events.${run.triggerEvent}`) : t(`RoutineTriggerKind.${run.triggerKind}`)}
        </AppChip>
      </InfoRow>

      {run.triggerEntityId && (
        <InfoRow label={t("RoutineDetail.triggerRecord")}>
          {context?.recordRef ? (
            run.triggerEvent === "record.deleted" ? (
              <span className="text-xs">{t("Common.events.record.deleted")}</span>
            ) : (
              <IntlLink
                className="text-xs underline underline-offset-2"
                href={`/records/${context.recordRef.typeId}/${context.recordRef.recordId}`}
              >
                {t("RecordModel.openRecord", { name: t("RecordModel.record") })}
              </IntlLink>
            )
          ) : (
            <span className="font-mono text-xs">{run.triggerEntityId}</span>
          )}
        </InfoRow>
      )}

      {context?.threadId && (
        <InfoRow label={t("RoutineDetail.triggerThread")}>
          <span className="font-mono text-xs">{context.threadId}</span>
        </InfoRow>
      )}

      {context && context.changedFields.length > 0 && (
        <InfoRow label={t("RoutineDetail.triggerChangedFields")}>
          <span className="flex flex-wrap justify-end gap-1">
            {context.changedFields.map((field) => (
              <AppChip key={field} size="sm">
                {context.changedFieldLabels[field] ??
                  (context.recordRef
                    ? (recordFields?.find((definition) => definition.id === field)?.label ??
                      t("RecordWidgets.unavailable"))
                    : (recordFields?.find((definition) => definition.id === field)?.label ??
                      changeFieldLabel(field, customColumns)))}
              </AppChip>
            ))}

            {context.changedFieldsTruncated && (
              <AppChip size="sm" variant="secondary">
                {t("RoutineDetail.triggerChangedFieldsMore")}
              </AppChip>
            )}
          </span>
        </InfoRow>
      )}
    </div>
  );
}
