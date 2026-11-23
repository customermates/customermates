"use client";

import type { WorkspaceBookingLinkDto } from "@/ee/calendar/booking.schema";
import type { BookingPanelStore } from "./booking-panel.store";

import { useRef } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CalendarClock, Clock, MapPin, Pencil, Trash2, Video } from "lucide-react";

import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ItemActions, ItemActionsTrigger } from "@/components/ui/item-actions";
import { Switch } from "@/components/ui/switch";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

import { BookingLinkPill } from "./booking-link-pill";
import { bookingHostNames, bookingPublicPath } from "./booking-panel-model";

type Props = {
  link: WorkspaceBookingLinkDto;
  store: BookingPanelStore;
  readOnly: boolean;
  onEdit: (link: WorkspaceBookingLinkDto, invoker: HTMLElement | null) => void;
};

function hostItems(link: WorkspaceBookingLinkDto) {
  return bookingHostNames(link).map((name, index) => {
    const split = name.indexOf(" ");
    return {
      id: `${link.id}-${index}`,
      firstName: split === -1 ? name : name.slice(0, split),
      lastName: split === -1 ? "" : name.slice(split + 1),
    };
  });
}

export const BookingPageRow = observer(function BookingPageRow({ link, store, readOnly, onEdit }: Props) {
  const t = useTranslations();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const live = link.enabled && link.calendarId !== null;
  const editable = link.own && !readOnly;
  const Place = link.withVideo ? Video : MapPin;
  const status =
    link.calendarId === null
      ? t("Booking.panelUnavailable")
      : link.enabled
        ? t("Booking.upcomingCount", { count: link.upcomingBookings })
        : t("Booking.paused");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const menu = (
    <>
      {link.own ? (
        <DropdownMenuItem data-booking-edit="" onSelect={() => onEdit(link, triggerRef.current)}>
          <Pencil aria-hidden className="size-4" />

          {t("Booking.edit")}
        </DropdownMenuItem>
      ) : null}

      <DropdownMenuItem asChild>
        <IntlLink href={bookingPublicPath(link.url)} target="_blank">
          <ArrowUpRight aria-hidden className="size-4" />

          {t("Booking.open")}
        </IntlLink>
      </DropdownMenuItem>

      {editable ? (
        <>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            data-booking-delete=""
            variant="destructive"
            onSelect={() => showDeleteConfirmation(() => store.remove(link.id), link.title)}
          >
            <Trash2 aria-hidden className="size-4" />

            {t("Common.actions.delete")}
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );

  return (
    <ItemActions label={t("Booking.pageActions", { title: link.title })} menu={menu}>
      <li className="flex flex-col gap-2.5 border-b px-6 py-3.5 last:border-b-0" data-booking-link={link.id}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl border bg-card shadow-xs",
              !live && "text-muted-foreground",
            )}
          >
            <CalendarClock className="size-4" />
          </span>

          <div className={cn("flex min-w-0 flex-1 flex-col", !live && "text-muted-foreground")}>
            <h3 className="truncate text-sm font-medium">{link.title}</h3>

            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Clock aria-hidden className="size-3 shrink-0" />

              <span className="shrink-0">{t("Booking.minutes", { minutes: link.durationMinutes })}</span>

              <Place aria-hidden className="ms-1 size-3 shrink-0" />

              <span className="truncate">{link.withVideo ? t("Booking.placeVideo") : t("Booking.placeInPerson")}</span>
            </span>
          </div>

          <AvatarStack className={cn(!live && "opacity-60")} items={hostItems(link)} maxVisible={3} />

          <Switch
            aria-label={t("Booking.fields.enabled")}
            checked={link.enabled}
            disabled={!editable || store.pending.has(link.id)}
            id={`booking-enabled-${link.id}`}
            onCheckedChange={(next) => runUserAction(() => store.toggle(link.id, next))}
          />

          <ItemActionsTrigger ref={triggerRef} />
        </div>

        <div className="flex min-w-0 items-center gap-2 ps-12">
          <BookingLinkPill url={link.url} />

          <span className="shrink-0 text-xs text-muted-foreground" data-booking-status="">
            {status}
          </span>
        </div>

        {link.calendarId === null ? (
          <Alert
            stacked
            action={
              editable ? (
                <Button size="sm" variant="secondary" onClick={(event) => onEdit(link, event.currentTarget)}>
                  {t("Booking.chooseCalendar")}
                </Button>
              ) : undefined
            }
            className="ms-12"
            data-booking-calendar-missing=""
            description={t("Booking.noCalendar")}
            role="status"
            variant="warning"
          />
        ) : null}
      </li>
    </ItemActions>
  );
});
