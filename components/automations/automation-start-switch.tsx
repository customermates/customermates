"use client";

import { useTranslations } from "next-intl";

import { SegmentedControl } from "@/components/ui/segmented-control";

export type AutomationStart = "event" | "schedule";

export function AutomationStartSwitch({
  value,
  disabled,
  onChange,
}: {
  value: AutomationStart;
  disabled?: Partial<Record<AutomationStart, boolean>>;
  onChange: (value: AutomationStart) => void;
}) {
  const t = useTranslations();
  return (
    <div data-automation-start={value}>
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
    </div>
  );
}
