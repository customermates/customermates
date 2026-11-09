import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";

import { UpsellPreviewFrame, UpsellPreviewTitle } from "./upsell-preview-frame";

type Props = {
  className?: string;
};

export function UpsellRoutinesPreview({ className }: Props) {
  const t = useTranslations();
  const rows = [
    {
      name: t("Upsell.preview.routines.firstName"),
      trigger: t("Upsell.preview.routines.firstTrigger"),
      lastRun: t("RoutineRunStatus.succeeded"),
    },
    {
      name: t("Upsell.preview.routines.secondName"),
      trigger: t("RoutineTriggerKind.event"),
      lastRun: null,
    },
  ];

  return (
    <UpsellPreviewFrame className={className} label={t("Upsell.preview.routines.label")}>
      <UpsellPreviewTitle>{t("NavigationBar.routines")}</UpsellPreviewTitle>

      {rows.map((row, index) => (
        <div
          key={row.name}
          aria-hidden
          className={
            index === 0
              ? "flex items-center gap-2.5 rounded-lg bg-accent px-2.5 py-2"
              : "flex items-center gap-2.5 px-2.5 py-2"
          }
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-foreground">{row.name}</span>

            <span className="block truncate text-[11px] text-muted-foreground">{row.trigger}</span>
          </span>

          <span className="flex shrink-0 items-center gap-1">
            {row.lastRun ? (
              <AppChip size="sm" variant="success">
                {row.lastRun}
              </AppChip>
            ) : null}

            <AppChip size="sm" variant="secondary">
              {t("RoutineModal.enabled")}
            </AppChip>
          </span>
        </div>
      ))}
    </UpsellPreviewFrame>
  );
}
