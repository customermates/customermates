"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { workspaceDisplayName, workspaceListName } from "@/app/components/workspaces/workspace-identity";
import { WorkspaceAvatar } from "@/app/components/workspaces/workspace-avatar";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { Button } from "@/components/ui/button";
import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

type Props = {
  ownerName: string | null;
};

const PlanPausedCardContent = observer(function PlanPausedCard({ ownerName }: Props) {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();
  const fallback = t("Workspaces.fallbackName");
  const workspace = workspaceDisplayName(workspacesStore.current?.name, fallback);
  const others = workspacesStore.others;
  const plan = t(`Subscription.planNames.${FREE_PLAN_UPGRADE_PLAN}`);

  return (
    <AppCard className="max-w-md" data-testid="plan-paused-card">
      <CardHeroHeader
        alt=""
        subtitle={
          ownerName ? t("PlanPausedCard.askOwner", { owner: ownerName, plan }) : t("PlanPausedCard.askAdmin", { plan })
        }
        title={t("PlanPausedCard.title")}
      />

      <AppCardBody>
        <p className="text-x-sm text-center text-subdued">{t("PlanPausedCard.body", { workspace })}</p>

        {others.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t("PlanPausedCard.switchTitle")}</p>

            <ul className="flex flex-col gap-1">
              {others.map((other) => {
                const name = workspaceListName(other, workspacesStore.items, fallback, (date) =>
                  t("Workspaces.unnamedCreated", { name: fallback, date }),
                );
                return (
                  <li key={other.companyId}>
                    <Button
                      className="w-full justify-start gap-2"
                      variant="secondary"
                      onClick={() => workspacesStore.requestSwitch(other.companyId)}
                    >
                      <WorkspaceAvatar companyId={other.companyId} name={name} size="sm" />

                      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </AppCardBody>

      <AppCardFooter>
        <Button className="w-full" variant="ink" onClick={() => window.location.reload()}>
          {t("Common.actions.refresh")}
        </Button>
      </AppCardFooter>
    </AppCard>
  );
});

export const PlanPausedCard = serverRenderedClient(PlanPausedCardContent);
