"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Status } from "@/generated/prisma";

import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

const PendingCardContent = observer(() => {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const current = workspacesStore.current;
  const canWithdraw = current?.status === Status.pendingAuthorization;
  const name = workspaceDisplayName(current?.name, t("Workspaces.fallbackName"));

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader subtitle={t("PendingCard.subtitle")} title={t("PendingCard.title")} />

      <AppCardBody>
        <p className="text-x-sm text-center">{t("PendingCard.body")}</p>
      </AppCardBody>

      <AppCardFooter className="flex-col gap-2">
        <Button className="w-full" onClick={() => window.location.reload()}>
          {t("Common.actions.refresh")}
        </Button>

        {canWithdraw ? (
          <Button
            className="w-full"
            id="pending-withdraw"
            variant="ghostDestructive"
            onClick={() => setConfirmingWithdraw(true)}
          >
            {t("PendingCard.withdraw")}
          </Button>
        ) : null}
      </AppCardFooter>

      <ConfirmDialog
        anchorScope="pending-withdraw-confirm"
        confirmLabel={t("PendingCard.withdraw")}
        description={t("PendingCard.withdrawConfirmDescription")}
        open={confirmingWithdraw}
        title={t("PendingCard.withdrawConfirmTitle", { name })}
        onCancel={() => setConfirmingWithdraw(false)}
        onConfirm={async () => {
          if (!(await workspacesStore.withdrawCurrentRequest())) setConfirmingWithdraw(false);
        }}
      />
    </AppCard>
  );
});

export const PendingCard = serverRenderedClient(PendingCardContent);
