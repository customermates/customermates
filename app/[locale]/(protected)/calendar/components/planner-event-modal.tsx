"use client";

import type { PlannerEntry } from "@/features/planner/planner-entries";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { Button } from "@/components/ui/button";
import { useRecordValueFormat } from "@/components/records/record-value";

export function PlannerEventModal({
  event,
  timeZone,
  name,
  onClose,
}: {
  event: PlannerEntry;
  timeZone: string;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const format = useRecordValueFormat();
  const url =
    event.provider?.toLowerCase() === "google"
      ? `https://calendar.google.com/calendar/u/0/r/day/${event.entry.start.replace(/-/gu, "/")}`
      : `https://outlook.office.com/calendar/view/day/date/${event.entry.start}`;
  return (
    <AppModal open titleInContent size="lg" title={name} onClose={onClose}>
      <AppCard>
        <AppCardHeader>
          <AppModalTitle>{name}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("Planner.readOnlyEvent")}</p>

          <p className="text-sm">
            {event.entry.time
              ? format.date(new Date(event.entry.time), { dateStyle: "full", timeStyle: "short", timeZone })
              : format.date(new Date(`${event.entry.start}T00:00:00Z`), { dateStyle: "full", timeZone: "UTC" })}
          </p>

          {event.location && <p className="text-sm">{event.location}</p>}

          <Button asChild variant="secondary">
            <a href={url} rel="noopener noreferrer" target="_blank">
              <ArrowUpRight aria-hidden className="size-4" />

              {t("Planner.openProvider")}
            </a>
          </Button>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
}
