"use client";

import type { BaseDataViewStore, CalendarFieldChoice, HasId } from "@/core/base/base-data-view.store";
import type { CalendarViewConfig } from "@/core/data-view/calendar-view-config.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { PopoverSection as Section } from "./popover-section";

const NONE = "__none__";

function FieldSelect({
  id,
  label,
  value,
  choices,
  optional,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null | undefined;
  choices: CalendarFieldChoice[];
  optional: boolean;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations();
  return (
    <Section label={label}>
      <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
        <SelectTrigger aria-label={label} className="h-8 w-full" id={id} size="sm">
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {optional && <SelectItem value={NONE}>{t("Common.none")}</SelectItem>}

          {choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Section>
  );
}

export const CalendarDisplayOptions = observer(function CalendarDisplayOptions<E extends HasId>({
  store,
  anchorScope,
}: {
  store: BaseDataViewStore<E>;
  anchorScope?: string;
}) {
  const t = useTranslations();
  const options = store.calendarFieldOptions;
  const calendar = store.calendar;
  if (!options || !calendar) return null;
  const ends = options.endsFor(calendar.dateFieldId);
  const update = (next: Partial<CalendarViewConfig>) => store.setViewOptions({ calendar: { ...calendar, ...next } });
  const scope = anchorScope ?? "data-view";

  return (
    <>
      <FieldSelect
        choices={options.dates}
        id={`${scope}-calendar-date-field`}
        label={t("DataView.calendar.dateField")}
        optional={false}
        value={calendar.dateFieldId}
        onChange={(dateFieldId) => {
          if (!dateFieldId) return;
          const keepEnd = options.endsFor(dateFieldId).some((choice) => choice.id === calendar.endDateFieldId);
          update({ dateFieldId, endDateFieldId: keepEnd ? calendar.endDateFieldId : null });
        }}
      />

      {ends.length > 0 && (
        <FieldSelect
          optional
          choices={ends}
          id={`${scope}-calendar-end-field`}
          label={t("DataView.calendar.endDateField")}
          value={calendar.endDateFieldId}
          onChange={(endDateFieldId) => update({ endDateFieldId })}
        />
      )}

      {options.colors.length > 0 && (
        <FieldSelect
          optional
          choices={options.colors}
          id={`${scope}-calendar-color-field`}
          label={t("DataView.calendar.colorField")}
          value={calendar.colorFieldId}
          onChange={(colorFieldId) => update({ colorFieldId })}
        />
      )}
    </>
  );
});
