"use client";

import type { AutomationBuilderStore } from "./automation-builder.store";

import { Eye } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/ui/spinner";
import { AUTOMATION_DATE_LOOKBACK_DAYS } from "@/features/automation-rules/automation-rule.schema";
import { IntlLink } from "@/i18n/navigation";

export const AutomationPreviewPane = observer(function AutomationPreviewPane({
  store,
}: {
  store: AutomationBuilderStore;
}) {
  const t = useTranslations();
  const { preview, previewLoading, form } = store;
  const typeId = "typeId" in form.trigger ? form.trigger.typeId : "";

  return (
    <div className="flex flex-col gap-3" data-automation-preview="">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Eye aria-hidden="true" className="size-4" />

        {t("Automations.preview.title")}
      </p>

      {previewLoading && !preview && <Spinner aria-label={t("PageState.loading")} />}

      {!previewLoading && !preview && (
        <p className="text-sm text-muted-foreground">{t("Automations.preview.incomplete")}</p>
      )}

      {preview && !preview.supported && (
        <p className="text-sm text-muted-foreground">{t("Automations.preview.unsupported")}</p>
      )}

      {preview?.supported && (
        <>
          <p className="text-lg leading-snug font-semibold" data-automation-preview-count={preview.total}>
            {t("Automations.preview.wouldRun", { count: preview.total, days: AUTOMATION_DATE_LOOKBACK_DAYS })}
          </p>

          <p className="text-sm text-muted-foreground">{t("Automations.preview.note")}</p>

          {preview.alreadyFired > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("Automations.preview.alreadyFired", { count: preview.alreadyFired })}
            </p>
          )}

          {typeId && preview.recordIds.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {preview.recordIds.slice(0, 3).map((recordId) => (
                <li key={recordId}>
                  <IntlLink className="underline" href={`/records/${typeId}/${recordId}`}>
                    {t("Automations.preview.record")}
                  </IntlLink>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
});
