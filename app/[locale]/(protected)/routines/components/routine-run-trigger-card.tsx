"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { RoutineRunDto } from "@/ee/routines/routine.schema";

import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { InfoRow } from "@/components/shared/info-row";
import { useChangeFieldLabel } from "@/components/entity-terminology/use-change-field-label";

type Props = {
  run: RoutineRunDto;
  customColumns: CustomColumnDto[];
};

export function RoutineRunTriggerCard({ run, customColumns }: Props) {
  const t = useTranslations();
  const changeFieldLabel = useChangeFieldLabel();
  const context = run.triggerContext;

  return (
    <div className="space-y-1.5 border-b px-6 py-3">
      <InfoRow label={t("RoutineDetail.trigger")}>
        <AppChip size="sm" variant="secondary">
          {run.triggerEvent ? t(`Common.events.${run.triggerEvent}`) : t(`RoutineTriggerKind.${run.triggerKind}`)}
        </AppChip>
      </InfoRow>

      {run.triggerEntityId && (
        <InfoRow label={t("RoutineDetail.triggerRecord")}>
          <span className="font-mono text-xs">{run.triggerEntityId}</span>
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
                {changeFieldLabel(field, customColumns)}
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
