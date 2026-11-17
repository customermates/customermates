"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Status } from "@/generated/prisma";

import { supportMailHref } from "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/subscription/support-mail-href";
import { LeaveInactiveWorkspaceDialog } from "@/app/components/workspaces/leave-inactive-workspace-dialog";
import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

const InactiveCardContent = observer(() => {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const current = workspacesStore.current;
  const canLeave = current?.status === Status.inactive;
  const reason = current?.inactiveReason ?? null;
  const needsSupport = reason === "noActiveAdmin";
  const supportHref = needsSupport ? supportMailHref(t("SubscriptionExpiredView.supportEmailSubject")) : null;
  const workspace = workspaceDisplayName(current?.name, t("Workspaces.fallbackName"));

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader
        alt=""
        subtitle={needsSupport ? t("InactiveCard.supportSubtitle") : t("InactiveCard.subtitle")}
        title={t("InactiveCard.title", { workspace })}
      />

      <AppCardBody>
        <p className="text-x-sm text-center">{needsSupport ? t("InactiveCard.supportBody") : t("InactiveCard.body")}</p>

        {workspacesStore.others.length > 0 ? (
          <p className="text-x-sm text-center">{t("InactiveCard.otherWorkspaces")}</p>
        ) : null}
      </AppCardBody>

      <AppCardFooter className="flex-col gap-2">
        <Button className="w-full" onClick={() => window.location.reload()}>
          {t("Common.actions.refresh")}
        </Button>

        {supportHref ? (
          <Button asChild className="w-full" variant="ghost">
            <a href={supportHref} id="inactive-contact-support">
              {t("SubscriptionExpiredView.contactSupportCta")}
            </a>
          </Button>
        ) : null}

        {canLeave ? (
          <Button
            className="w-full"
            id="inactive-leave"
            variant="ghostDestructive"
            onClick={() => setConfirmingLeave(true)}
          >
            {t("Workspaces.leave")}
          </Button>
        ) : null}
      </AppCardFooter>

      <LeaveInactiveWorkspaceDialog
        anchorScope="inactive-leave-confirm"
        companyId={current?.companyId ?? null}
        name={workspace}
        open={confirmingLeave}
        reason={reason}
        onClose={() => setConfirmingLeave(false)}
      />
    </AppCard>
  );
});

export const InactiveCard = serverRenderedClient(InactiveCardContent);
