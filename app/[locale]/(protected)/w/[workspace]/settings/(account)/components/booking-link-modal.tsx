"use client";

import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormTextarea } from "@/components/forms/form-textarea";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { AppModal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useRootStore } from "@/core/stores/root-store.provider";
import { WORKING_WEEKDAYS } from "@/ee/calendar/working-hours";

const NONE = "none";
const DURATIONS = [15, 30, 45, 60, 90, 120];
const BUFFERS = [0, 5, 10, 15, 30, 60];
const NOTICE_MINUTES = [0, 60, 240, 720, 1440, 2880, 10080];
const HORIZONS = [7, 14, 30, 60, 90];

export const BookingLinkModal = observer(() => {
  const t = useTranslations();
  const store = useRootStore().bookingLinkModalStore;
  const { form, setup } = store;
  const timeZones = useMemo(
    () => ["UTC", ...Intl.supportedValuesOf("timeZone")].map((value) => ({ value, label: value.replace(/_/gu, " ") })),
    [],
  );
  const recordList = store.selectedRecordList;
  const noneItem = { value: NONE, label: t("Booking.fields.none") };
  const weekdayLabels: Record<(typeof WORKING_WEEKDAYS)[number], string> = {
    monday: t("Booking.weekdays.monday"),
    tuesday: t("Booking.weekdays.tuesday"),
    wednesday: t("Booking.weekdays.wednesday"),
    thursday: t("Booking.weekdays.thursday"),
    friday: t("Booking.weekdays.friday"),
    saturday: t("Booking.weekdays.saturday"),
    sunday: t("Booking.weekdays.sunday"),
  };

  return (
    <AppModal store={store} title={form.id ? t("Booking.editTitle") : t("Booking.newTitle")}>
      <AppForm store={store}>
        <AppCard className="relative">
          <AppCardHeader>
            <h2 className="text-x-lg">{form.id ? t("Booking.editTitle") : t("Booking.newTitle")}</h2>
          </AppCardHeader>

          <AppCardBody className="pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]">
            <FormInput required id="title" label={t("Booking.fields.title")} />

            <FormTextarea id="description" label={t("Booking.fields.description")} rows={2} />

            {setup.calendars.length > 1 ? (
              <FormSelect
                required
                id="calendarId"
                items={setup.calendars.map((calendar) => ({
                  value: calendar.id,
                  label: calendar.accountLabel ? `${calendar.name} (${calendar.accountLabel})` : calendar.name,
                }))}
                label={t("Booking.fields.calendar")}
              />
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormSelect
                id="durationMinutes"
                items={DURATIONS.map((minutes) => ({ value: String(minutes), label: t("Booking.minutes", { minutes }) }))}
                label={t("Booking.fields.duration")}
                value={String(form.durationMinutes)}
                onValueChange={(value) => store.onChange("durationMinutes", Number(value))}
              />

              <FormSelect
                id="bufferMinutes"
                items={BUFFERS.map((minutes) => ({ value: String(minutes), label: t("Booking.minutes", { minutes }) }))}
                label={t("Booking.fields.buffer")}
                value={String(form.bufferMinutes)}
                onValueChange={(value) => store.onChange("bufferMinutes", Number(value))}
              />

              <FormSelect
                id="minNoticeMinutes"
                items={NOTICE_MINUTES.map((minutes) => ({
                  value: String(minutes),
                  label: t("Booking.notice", { hours: minutes / 60 }),
                }))}
                label={t("Booking.fields.minNotice")}
                value={String(form.minNoticeMinutes)}
                onValueChange={(value) => store.onChange("minNoticeMinutes", Number(value))}
              />

              <FormSelect
                id="horizonDays"
                items={HORIZONS.map((days) => ({ value: String(days), label: t("Booking.days", { days }) }))}
                label={t("Booking.fields.horizon")}
                value={String(form.horizonDays)}
                onValueChange={(value) => store.onChange("horizonDays", Number(value))}
              />
            </div>

            <FormAutocomplete
              id="timeZone"
              items={timeZones}
              label={t("Booking.fields.timeZone")}
              renderValue={(items) => items.map((item) => item.data?.label ?? item.key).join("")}
              value={form.timeZone}
              onValueChange={(value) => {
                if (typeof value === "string" && value) store.onChange("timeZone", value);
              }}
            >
              {(item) => <FormAutocompleteItem textValue={item.label}>{item.label}</FormAutocompleteItem>}
            </FormAutocomplete>

            <fieldset className="space-y-2" data-booking-hours="">
              <legend className="text-sm font-medium">{t("Booking.fields.workingHours")}</legend>

              {WORKING_WEEKDAYS.map((day) => {
                const window = form.workingHours[day][0];
                const open = form.workingHours[day].length > 0;
                return (
                  <div key={day} className="flex flex-wrap items-center gap-2">
                    <Switch
                      aria-label={weekdayLabels[day]}
                      checked={open}
                      id={`booking-day-${day}`}
                      onCheckedChange={(next) => store.setDay(day, { open: next })}
                    />

                    <span className="w-24 text-sm">{weekdayLabels[day]}</span>

                    {open && window ? (
                      <>
                        <Input
                          aria-label={t("Booking.fields.from")}
                          className="w-28"
                          type="time"
                          value={window.start}
                          onChange={(event) => store.setDay(day, { start: event.target.value })}
                        />

                        <span aria-hidden>-</span>

                        <Input
                          aria-label={t("Booking.fields.to")}
                          className="w-28"
                          type="time"
                          value={window.end}
                          onChange={(event) => store.setDay(day, { end: event.target.value })}
                        />
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("Booking.closed")}</span>
                    )}
                  </div>
                );
              })}
            </fieldset>

            <FormSwitch id="withVideo" label={t("Booking.fields.withVideo")} />

            <FormSelect
              id="personTypeId"
              items={[
                noneItem,
                ...setup.lists.filter((list) => list.hasChannels).map((list) => ({ value: list.id, label: list.label })),
              ]}
              label={t("Booking.fields.personList")}
              value={form.personTypeId || NONE}
              onValueChange={(value) => store.onChange("personTypeId", value === NONE ? "" : value)}
            />

            <FormSelect
              id="recordTypeId"
              items={[
                noneItem,
                ...setup.lists.filter((list) => list.primaryFieldId).map((list) => ({ value: list.id, label: list.label })),
              ]}
              label={t("Booking.fields.recordList")}
              value={form.recordTypeId || NONE}
              onValueChange={(value) => store.setRecordList(value === NONE ? "" : value)}
            />

            {recordList ? (
              <>
                <FormSelect
                  id="startFieldId"
                  items={[noneItem, ...recordList.dateFields.map((field) => ({ value: field.id, label: field.label }))]}
                  label={t("Booking.fields.startField")}
                  value={form.startFieldId || NONE}
                  onValueChange={(value) => store.onChange("startFieldId", value === NONE ? "" : value)}
                />

                <div className="space-y-2" data-booking-questions="">
                  <p className="text-sm font-medium">{t("Booking.fields.questions")}</p>

                  {form.questions.map((question, index) => (
                    <div key={question.fieldId} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {recordList.questionFields.find((field) => field.id === question.fieldId)?.label ??
                          t("Booking.unavailableField")}
                      </span>

                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={question.required}
                          onCheckedChange={(next) => store.setQuestion(index, { required: next })}
                        />

                        {t("Booking.fields.required")}
                      </label>

                      <IconButton
                        icon={X}
                        label={t("Booking.removeQuestion")}
                        onClick={() => store.removeQuestion(index)}
                      />
                    </div>
                  ))}

                  {store.unusedQuestionFields.length && form.questions.length < 8 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {store.unusedQuestionFields.map((field) => (
                        <Button
                          key={field.id}
                          size="sm"
                          type="button"
                          variant="secondary"
                          onClick={() => store.addQuestion(field.id)}
                        >
                          <Plus aria-hidden className="size-4" />

                          {field.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            <FormTextarea id="successMessage" label={t("Booking.fields.successMessage")} rows={2} />

            <FormSwitch id="enabled" label={t("Booking.fields.enabled")} />
          </AppCardBody>

          <UnsavedChangesBar creating={!form.id} anchorScope="booking-link-modal" store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
