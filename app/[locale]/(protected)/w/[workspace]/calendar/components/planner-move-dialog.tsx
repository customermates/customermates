"use client";

import type { MeetingScope } from "@/ee/calendar/meeting.schema";
import type { PlannerMoveQuestion } from "./planner-calendar-adapter";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { MeetingScopeChoice } from "@/app/components/schedule-meeting/meeting-scope-choice";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";

export type PlannerMoveDecision = { sendInvites: boolean; scope?: MeetingScope };

export function PlannerMoveDialog({
  question,
  onDecide,
}: {
  question: PlannerMoveQuestion | null;
  onDecide: (decision: PlannerMoveDecision | null) => void;
}) {
  const t = useTranslations();
  const [scope, setScope] = useState<MeetingScope>("occurrence");
  const [shown, setShown] = useState(question);
  if (shown !== question) {
    setShown(question);
    setScope("occurrence");
  }
  const chosenScope = question?.scope ? scope : undefined;

  return (
    <ConfirmDialog
      alternativeLabel={t("Planner.moveDialog.justMove")}
      anchorScope="planner-move"
      confirmLabel={question?.notify ? t("Planner.moveDialog.notify") : t("Planner.moveDialog.move")}
      confirmVariant="default"
      description={
        question?.notify ? t("Planner.moveDialog.notifyDescription") : t("Planner.moveDialog.scopeDescription")
      }
      open={question !== null}
      title={question?.notify ? t("Planner.moveDialog.notifyTitle") : t("Planner.moveDialog.scopeTitle")}
      onAlternative={question?.notify ? () => onDecide({ sendInvites: false, scope: chosenScope }) : undefined}
      onCancel={() => onDecide(null)}
      onConfirm={() => onDecide({ sendInvites: Boolean(question?.notify), scope: chosenScope })}
    >
      {question?.scope ? <MeetingScopeChoice value={scope} onChange={setScope} /> : null}
    </ConfirmDialog>
  );
}
