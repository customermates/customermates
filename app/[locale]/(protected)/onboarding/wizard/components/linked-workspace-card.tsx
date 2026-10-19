"use client";

import { Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { switchWorkspaceAction } from "@/app/[locale]/(protected)/settings/(account)/workspaces/actions";
import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

type Props = { companyId: string; name: string | null };

const LinkedWorkspaceCardContent = observer(function LinkedWorkspaceCardContent({ companyId, name }: Props) {
  const t = useTranslations();
  const { workspacesStore } = useRootStore();
  const [switching, setSwitching] = useState(false);
  const busy = switching || workspacesStore.isNavigating;
  const workspace = workspaceDisplayName(name, t("Workspaces.fallbackName"));

  const switchWorkspace = async () => {
    setSwitching(true);
    try {
      const result = await switchWorkspaceAction({ companyId });
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      workspacesStore.enter({ companyId: result.data.companyId, name }, "/onboarding/wizard");
    } finally {
      setSwitching(false);
    }
  };

  return (
    <AppCard className="max-w-lg">
      <AppCardBody className="gap-1">
        <h1 className="text-2xl font-semibold [overflow-wrap:anywhere]">
          {t("OnboardingWizard.linkedWorkspace.title", { workspace })}
        </h1>

        <p className="text-sm text-muted-foreground">
          {t("OnboardingWizard.linkedWorkspace.description", { workspace })}
        </p>
      </AppCardBody>

      <AppCardFooter>
        <Button className="w-full" disabled={busy} type="button" onClick={() => runUserAction(switchWorkspace)}>
          {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

          {t("OnboardingWizard.linkedWorkspace.switch")}
        </Button>
      </AppCardFooter>
    </AppCard>
  );
});

export const LinkedWorkspaceCard = serverRenderedClient(LinkedWorkspaceCardContent);
