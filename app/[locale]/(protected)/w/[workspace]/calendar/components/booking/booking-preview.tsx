"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { PublicBookingView } from "@/app/[locale]/(public)/book/[token]/public-booking-view";
import { useRootStore } from "@/core/stores/root-store.provider";

import { bookingPreviewPage, bookingPreviewSlots } from "./booking-preview-model";

export const BookingPreview = observer(function BookingPreview() {
  const t = useTranslations();
  const root = useRootStore();
  const { form, setup } = root.bookingLinkModalStore;
  const user = root.userStore.user;
  const [now] = useState(() => new Date());
  const hostName = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
  const page = {
    ...bookingPreviewPage(form, setup, hostName, t("Booking.pagePreviewTitle")),
    workspaceName: root.workspacesStore.current?.name ?? null,
  };
  const preview = { slots: bookingPreviewSlots(form, now), timeZone: form.timeZone };

  return (
    <section aria-label={t("Booking.pagePreviewLabel")} className="flex flex-col gap-2" data-booking-preview-pane="">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">{t("Booking.pagePreviewLabel")}</h3>

        <p className="text-xs text-muted-foreground">{t("Booking.pagePreviewHint")}</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <PublicBookingView page={page} preview={preview} token="" />
      </div>
    </section>
  );
});
