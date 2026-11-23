"use client";

import { useTranslations } from "next-intl";

import { SegmentedControl } from "@/components/ui/segmented-control";

export type AutomationStart = "event" | "schedule";

export function AutomationStartSwitch({
  value,
  disabled,
  hint,
  onChange,
}: {
  value: AutomationStart;
  disabled?: Partial<Record<AutomationStart, boolean>>;
  hint?: "scheduleNeedsMateOnly";
  onChange: (value: AutomationStart) => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-1.5" data-automation-start={value}>
      <SegmentedControl
        idPrefix="automation-start"
        items={[
          { value: "event", label: t("Automations.startsOn.event"), disabled: disabled?.event, controls: false },
          {
            value: "schedule",
            label: t("Automations.startsOn.schedule"),
            disabled: disabled?.schedule,
            controls: false,
          },
        ]}
        label={t("Automations.startsOn.label")}
        listClassName="h-9 [&>*]:whitespace-nowrap"
        value={value}
        onValueChange={(next) => {
          if (next !== value) onChange(next);
        }}
      />

      {hint ? (
        <p className="text-xs text-muted-foreground" data-automation-start-hint={hint}>
          {t("Automations.startsOn.scheduleNeedsMateOnly")}
        </p>
      ) : null}
    </div>
  );
}
