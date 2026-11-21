"use client";

import type { RoutineModalStore } from "./routine-modal.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { RoutineTriggerKind } from "@/generated/prisma";

import { AutomationAgentIcon } from "@/components/automations/automation-agent-icon";
import { FormTextarea } from "@/components/forms/form-textarea";
import { Avatar } from "@/components/ui/avatar";

export const RoutineAgentFields = observer(({ store }: { store: RoutineModalStore }) => {
  const t = useTranslations();
  const { form } = store;
  const scheduled = form.triggerKind === RoutineTriggerKind.schedule;
  const owner = form.owner ?? (form.id ? null : store.rootStore.userStore.user);
  const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : t("RoutineDetail.ownerUnavailable");
  return (
    <div className="min-w-0 space-y-4" data-routine-agent-fields="">
      <FormTextarea
        required
        id="prompt"
        placeholder={scheduled ? t("RoutineModal.promptExampleSchedule") : t("RoutineModal.promptExampleEvent")}
        rows={8}
      />

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{t("Automations.canvas.runsOn")}</p>

        <p className="flex items-center gap-2 text-sm" data-routine-runs-on="">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <AutomationAgentIcon aria-hidden="true" className="size-3" />
          </span>

          {t("Automations.canvas.runtime.mate")}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{t("RoutineDetail.owner")}</p>

        <p className="flex items-center gap-2 text-sm" data-routine-runs-as="">
          {owner ? (
            <Avatar name={[owner.firstName, owner.lastName]} size="default" src={owner.avatarUrl} />
          ) : (
            <Avatar fallback="—" />
          )}

          {ownerName}
        </p>
      </div>
    </div>
  );
});
