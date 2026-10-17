"use client";

import type { McpConsentWorkspace } from "@/features/auth/list-mcp-consent-workspaces.interactor";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { WorkspaceAvatar } from "@/app/components/workspaces/workspace-avatar";
import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import { Button } from "@/components/ui/button";
import { RadioGroup } from "@/components/ui/radio-group";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { SelectableCard } from "@/components/forms/selectable-card";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

type Props = {
  clientName: string;
  consentCode: string;
  redirectHost: string;
  scopes: string[];
  workspaces: McpConsentWorkspace[];
};

const McpConsentCardContent = observer(({ clientName, consentCode, redirectHost, scopes, workspaces }: Props) => {
  const t = useTranslations();
  const { mcpConsentStore, navigationGuard } = useRootStore();
  useState(() => mcpConsentStore.initialize(workspaces));
  useEffect(() => mcpConsentStore.initialize(workspaces), [mcpConsentStore, workspaces]);
  const { canApprove, isSubmitting, selectedCompanyId, selectedWorkspace } = mcpConsentStore;

  const decide = async (accept: boolean) => {
    const redirectURI = await mcpConsentStore.decide(consentCode, accept);
    if (!redirectURI) return;

    navigationGuard.tryNavigate(() => {
      window.location.href = redirectURI;
    });
  };

  const scopeLabel = (scope: string): string => {
    switch (scope) {
      case "openid":
        return t("McpConsentCard.scopes.openid");
      case "profile":
        return t("McpConsentCard.scopes.profile");
      case "email":
        return t("McpConsentCard.scopes.email");
      case "offline_access":
        return t("McpConsentCard.scopes.offlineAccess");
      default:
        return scope;
    }
  };

  const unavailableLabel = (reason: McpConsentWorkspace["unavailableReason"]): string | undefined => {
    switch (reason) {
      case "pending":
        return t("Common.userStatuses.pendingAuthorization");
      case "inactive":
        return t("McpConsentWorkspace.unavailable.inactive");
      case "permission":
        return t("McpConsentWorkspace.unavailable.permission");
      case "plan":
        return t("McpConsentWorkspace.unavailable.plan");
      case "terms":
        return t("McpConsentWorkspace.unavailable.terms");
      default:
        return undefined;
    }
  };

  const selectedName = selectedWorkspace?.name?.trim();
  const title = selectedName
    ? t("McpConsentWorkspace.titleNamed", { client: clientName, workspace: selectedName })
    : t("McpConsentWorkspace.title", { client: clientName });

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader subtitle={t("McpConsentCard.subtitle", { client: clientName })} title={title} />

      <AppCardBody>
        <p className="text-x-sm">{t("McpConsentCard.body", { client: clientName })}</p>

        {mcpConsentStore.workspaces.length > 1 ? (
          <fieldset className="min-w-0">
            <legend className="text-muted-foreground mb-1.5 text-xs leading-none font-normal">
              {t("McpConsentWorkspace.pickerLabel")}
            </legend>

            <RadioGroup
              className="grid gap-2"
              disabled={isSubmitting}
              value={selectedCompanyId ?? ""}
              onValueChange={mcpConsentStore.select}
            >
              {mcpConsentStore.workspaces.map((workspace) => {
                const name = workspaceDisplayName(workspace.name, t("Workspaces.fallbackName"));

                return (
                  <SelectableCard
                    key={workspace.companyId}
                    description={
                      unavailableLabel(workspace.unavailableReason) ??
                      (workspace.isCurrent ? t("McpConsentWorkspace.current") : undefined)
                    }
                    disabled={isSubmitting || workspace.unavailableReason !== null}
                    id={`mcp-consent-workspace-${workspace.companyId}`}
                    label={name}
                    leading={<WorkspaceAvatar companyId={workspace.companyId} name={name} size="sm" />}
                    selectionMode="single"
                    value={workspace.companyId}
                  />
                );
              })}
            </RadioGroup>
          </fieldset>
        ) : null}

        {!canApprove && <p className="text-x-sm text-destructive">{t("McpConsentCard.permissionRequired")}</p>}

        <ul className="text-x-sm text-subdued list-disc space-y-1 pl-5">
          <li>{t("McpConsentCard.access.crmData")}</li>

          <li>{t("McpConsentCard.access.messaging")}</li>

          {scopes.map((scope) => (
            <li key={scope}>{scopeLabel(scope)}</li>
          ))}
        </ul>

        <p className="text-x-xs text-subdued">{t("McpConsentWorkspace.scopeHint", { client: clientName })}</p>

        <p className="text-x-xs text-subdued">{t("McpConsentCard.destination", { host: redirectHost })}</p>
      </AppCardBody>

      <AppCardFooter>
        <Button disabled={isSubmitting} variant="secondary" onClick={() => runUserAction(() => decide(false))}>
          {t("McpConsentCard.deny")}
        </Button>

        {canApprove && (
          <Button disabled={isSubmitting} onClick={() => runUserAction(() => decide(true))}>
            {t("McpConsentCard.approve")}
          </Button>
        )}
      </AppCardFooter>
    </AppCard>
  );
});

export const McpConsentCard = serverRenderedClient(McpConsentCardContent);
