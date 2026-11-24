"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { MESSAGING_UPSELL_PLAN } from "@/app/components/upsell/plan-upsell-highlights";
import { PlanUpsellNotice } from "@/app/components/upsell/plan-upsell-notice";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormInput } from "@/components/forms/form-input";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormTextarea } from "@/components/forms/form-textarea";
import { AppForm } from "@/components/forms/form-context";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { AppModal } from "@/components/modal";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRootStore } from "@/core/stores/root-store.provider";
import { MEETING_DURATION_MINUTES } from "@/ee/calendar/meeting-durations";
import { effectivePlanId, getEntitlements } from "@/ee/subscription/entitlements";

export const ScheduleMeetingModal = observer(() => {
  const t = useTranslations();
  const root = useRootStore();
  const store = root.scheduleMeetingModalStore;
  const { form, options, slots, slotsLoading, unavailable } = store;
  const subscription = root.subscriptionStore.subscription;
  const planLocked = subscription != null && !getEntitlements(effectivePlanId(subscription)).messaging;
  const editing = store.editingId !== null;
  const blocked = editing ? null : (options?.blockedReason ?? null);
  const loaded = editing ? store.eventLoaded : options !== null;
  const ready = !unavailable && !planLocked && loaded && blocked === null;
  const title = editing ? t("ScheduleMeeting.editTitle") : t("ScheduleMeeting.title");
  const durations = [...new Set<number>([...MEETING_DURATION_MINUTES, form.durationMinutes])]
    .filter((minutes) => minutes > 0)
    .sort((a, b) => a - b);

  const notice = unavailable ? (
    <Alert
      description={
        unavailable === "demo" ? t("ScheduleMeeting.unavailable.demo") : t("ScheduleMeeting.unavailable.selfHosted")
      }
      role="status"
      variant="info"
    />
  ) : planLocked ? (
    <PlanUpsellNotice
      detail={t("ScheduleMeeting.upsell.detail")}
      id="schedule-meeting"
      plan={MESSAGING_UPSELL_PLAN}
      title={t("ScheduleMeeting.upsell.title", { plan: t(`Subscription.planNames.${MESSAGING_UPSELL_PLAN}`) })}
    />
  ) : blocked ? (
    <Alert
      description={
        blocked === "needsReconnect"
          ? t("ScheduleMeeting.blocked.needsReconnect")
          : t("ScheduleMeeting.blocked.noCalendar")
      }
      role="status"
      variant="warning"
    />
  ) : store.optionsFailed ? (
    <Alert
      description={editing ? t("ScheduleMeeting.eventLoadFailed") : t("ScheduleMeeting.loadFailed")}
      role="alert"
      variant="destructive"
    />
  ) : !loaded ? (
    <div className="flex justify-center py-8">
      <Spinner aria-label={t("Loading.text")} className="size-5" />
    </div>
  ) : null;

  return (
    <AppModal store={store} title={title}>
      <AppForm store={store}>
        <AppCard className="relative">
          <AppCardHeader>
            <h2 className="text-x-lg">{title}</h2>
          </AppCardHeader>

          <AppCardBody className="pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]">
            {notice}

            {ready ? (
              <>
                <FormInput required id="title" label={t("ScheduleMeeting.fields.title")} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormIsoDatePicker
                    dateOnly
                    required
                    id="date"
                    label={t("ScheduleMeeting.fields.date")}
                    onValueChange={store.setDate}
                  />

                  <FormInput required id="time" label={t("ScheduleMeeting.fields.time")} step={900} type="time" />
                </div>

                <FormSelect
                  id="durationMinutes"
                  items={durations.map((minutes) => ({
                    value: String(minutes),
                    label: t("ScheduleMeeting.duration", { minutes }),
                  }))}
                  label={t("ScheduleMeeting.fields.duration")}
                  value={String(form.durationMinutes)}
                  onValueChange={(value) => store.setDuration(Number(value))}
                />

                <div className="space-y-1.5" data-schedule-meeting-slots="">
                  <p className="text-sm font-medium">{t("ScheduleMeeting.freeSlots", { timeZone: store.timeZone })}</p>

                  {slotsLoading ? (
                    <Spinner aria-label={t("Loading.text")} className="size-4" />
                  ) : slots.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {slots.map((slot) => (
                        <Button
                          key={slot.startsAt}
                          size="sm"
                          type="button"
                          variant={store.startsAt === slot.startsAt ? "default" : "secondary"}
                          onClick={() => store.pickSlot(slot)}
                        >
                          {store.slotLabel(slot)}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("ScheduleMeeting.noFreeSlots")}</p>
                  )}
                </div>

                {options && options.calendars.length > 1 ? (
                  <FormSelect
                    required
                    id="calendarId"
                    items={options.calendars.map((calendar) => ({
                      value: calendar.id,
                      label: calendar.accountLabel ? `${calendar.name} (${calendar.accountLabel})` : calendar.name,
                    }))}
                    label={t("ScheduleMeeting.fields.calendar")}
                  />
                ) : null}

                <FormInputChips
                  arrayMode
                  id="attendees"
                  label={t("ScheduleMeeting.fields.attendees")}
                  placeholder={t("ScheduleMeeting.attendeesPlaceholder")}
                />

                <FormInput id="location" label={t("ScheduleMeeting.fields.location")} />

                <FormTextarea id="description" label={t("ScheduleMeeting.fields.description")} rows={3} />

                {editing ? null : <FormSwitch id="videoLink" label={t("ScheduleMeeting.fields.videoLink")} />}

                <FormSwitch
                  id="sendInvites"
                  label={editing ? t("ScheduleMeeting.fields.sendUpdates") : t("ScheduleMeeting.fields.sendInvites")}
                />

                {options?.actionLists.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormSelect
                      id="followUpTypeId"
                      items={[
                        { value: "none", label: t("ScheduleMeeting.followUpNone") },
                        ...options.actionLists.map((list) => ({ value: list.typeId, label: list.label })),
                      ]}
                      label={t("ScheduleMeeting.fields.followUp")}
                      value={form.followUpTypeId || "none"}
                      onValueChange={(value) => store.setFollowUpList(value === "none" ? "" : value)}
                    />

                    {form.followUpTypeId ? (
                      <FormSelect
                        id="followUpDateFieldId"
                        items={store.followUpFields.map((field) => ({ value: field.id, label: field.label }))}
                        label={t("ScheduleMeeting.fields.followUpDate")}
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </AppCardBody>

          {ready ? <UnsavedChangesBar anchorScope="schedule-meeting-modal" creating={!editing} store={store} /> : null}
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
