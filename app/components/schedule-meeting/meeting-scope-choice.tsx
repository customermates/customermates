"use client";

import type { MeetingScope } from "@/ee/calendar/meeting.schema";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MEETING_SCOPES } from "@/ee/calendar/meeting.schema";

export function MeetingScopeChoice({
  value,
  disabled,
  onChange,
}: {
  value: MeetingScope;
  disabled?: boolean;
  onChange: (scope: MeetingScope) => void;
}) {
  const t = useTranslations();
  const id = useId();

  return (
    <div className="space-y-2" data-meeting-scope="">
      <p className="text-sm font-medium" id={`${id}-label`}>
        {t("ScheduleMeeting.scope.label")}
      </p>

      <RadioGroup
        aria-labelledby={`${id}-label`}
        disabled={disabled}
        value={value}
        onValueChange={(next) => onChange(next as MeetingScope)}
      >
        {MEETING_SCOPES.map((scope) => (
          <div key={scope} className="flex items-center gap-2">
            <RadioGroupItem id={`${id}-${scope}`} value={scope} />

            <Label htmlFor={`${id}-${scope}`}>
              {scope === "series" ? t("ScheduleMeeting.scope.series") : t("ScheduleMeeting.scope.occurrence")}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
