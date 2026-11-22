"use client";

import type { RoutineModalStore } from "./routine-modal.store";

import { Pause } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { FormInput } from "@/components/forms/form-input";
import { Alert } from "@/components/shared/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";

type Props = {
  store: RoutineModalStore;
  onPause: () => void;
};

export const RoutineConfigurationPane = observer(({ store, onPause }: Props) => {
  const t = useTranslations();
  const { form } = store;
  const ownerName = form.owner ? `${form.owner.firstName} ${form.owner.lastName}`.trim() : null;
  const ownerAvailable = store.hasAvailableOwner;
  return (
    <section aria-labelledby="routine-configuration-heading" className="min-w-0 space-y-4">
      <h3 className="sr-only" id="routine-configuration-heading">
        {t("RoutineModal.configurationHeading")}
      </h3>

      {form.id && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            {form.owner ? (
              <Avatar name={[form.owner.firstName, form.owner.lastName]} src={form.owner.avatarUrl} />
            ) : (
              <Avatar fallback="—" />
            )}

            <div className="min-w-0">
              <p className="text-subdued text-xs">{t("RoutineDetail.owner")}</p>

              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium">{ownerName ?? t("RoutineDetail.ownerUnavailable")}</p>

                {form.owner && !ownerAvailable && (
                  <AppChip size="sm" variant={USER_STATUS_COLORS_MAP[form.owner.status]}>
                    {t(`Common.userStatuses.${form.owner.status}`)}
                  </AppChip>
                )}
              </div>
            </div>
          </div>

          {store.isReadOnly && (
            <Alert
              description={
                store.isOwner && !store.canManage
                  ? t("RoutineDetail.ownerPermissionReadOnly")
                  : ownerAvailable && ownerName
                    ? t("RoutineDetail.ownerOnlyEdit", { owner: ownerName })
                    : t("RoutineDetail.ownerUnavailableReadOnly")
              }
              title={t("RoutineDetail.readOnlyTitle")}
              variant="neutral"
            />
          )}

          {store.canAdministerOtherRoutine && (
            <div className="space-y-3 border-t pt-3">
              <div>
                <p className="text-sm font-medium">{t("RoutineAdministration.title")}</p>

                <p className="text-subdued text-xs">{t("RoutineAdministration.help")}</p>
              </div>

              {form.enabled && (
                <Button
                  disabled={store.isLoading}
                  id="routine-admin-pause"
                  type="button"
                  variant="secondary"
                  onClick={onPause}
                >
                  <Pause className="size-4" />

                  {t("RoutineAdministration.pause")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <FormInput required id="name" />

      <p className="text-subdued text-xs" data-routine-enabled-help="">
        {form.enabled ? t("RoutineModal.enabledHelp") : t("RoutineModal.pausedHelp")}
      </p>
    </section>
  );
});
