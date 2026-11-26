"use client";

import type { ReactNode } from "react";
import type { McpConsentWorkspace } from "@/features/auth/list-mcp-consent-workspaces.interactor";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { WorkspaceAvatar } from "@/app/components/workspaces/workspace-avatar";
import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppLink } from "@/components/shared/app-link";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

type Props = {
  clientName: string;
  consentCode: string;
  fixedWorkspace: boolean;
  redirectHost: string;
  scopes: string[];
  termsOffered: boolean;
  termsRequired: boolean;
  workspaces: McpConsentWorkspace[];
};

const legalDocumentLinks = {
  dataPrivacyLink: (chunks: ReactNode) => (
    <AppLink inheritSize appearance="inline" href="/privacy" target="_blank">
      {chunks}
    </AppLink>
  ),
  dpaLink: (chunks: ReactNode) => (
    <AppLink inheritSize appearance="inline" href="/dpa" target="_blank">
      {chunks}
    </AppLink>
  ),
  termsOfServiceLink: (chunks: ReactNode) => (
    <AppLink inheritSize appearance="inline" href="/terms" target="_blank">
      {chunks}
    </AppLink>
  ),
};

const ROW_CLASS =
  "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-md border border-input bg-input-background px-3 py-2.5 shadow-xs";

const McpConsentCardContent = observer((props: Props) => {
  const { clientName, consentCode, fixedWorkspace, redirectHost, scopes, termsOffered, termsRequired, workspaces } =
    props;
  const t = useTranslations();
  const { mcpConsentStore, navigationGuard } = useRootStore();
  useState(() => mcpConsentStore.initialize(workspaces, { fixedWorkspace, termsOffered, termsRequired }));
  useEffect(
    () => mcpConsentStore.initialize(workspaces, { fixedWorkspace, termsOffered, termsRequired }),
    [mcpConsentStore, workspaces, fixedWorkspace, termsOffered, termsRequired],
  );
  const { canApprove, canSubmitApproval, isSubmitting } = mcpConsentStore;

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

  const fixedInactiveMessage = (reason: McpConsentWorkspace["inactiveReason"], workspace: string) => {
    switch (reason) {
      case "pausedByPlan":
        return t("PlanPausedCard.body", { workspace });
      case "noActiveAdmin":
        return t("InactiveCard.supportBody");
      default:
        return t("McpConsentWorkspace.fixed.unavailable.inactive", { workspace });
    }
  };

  const fixedUnavailableMessage = (choice: McpConsentWorkspace, workspace: string) => {
    switch (choice.unavailableReason) {
      case "pending":
        return t("McpConsentWorkspace.fixed.unavailable.pending", { workspace });
      case "inactive":
        return fixedInactiveMessage(choice.inactiveReason, workspace);
      case "permission":
        return t("McpConsentWorkspace.fixed.unavailable.permission", { workspace });
      case "plan":
        return t("McpConsentWorkspace.fixed.unavailable.plan", { workspace });
      case "terms":
        return t("McpConsentWorkspace.fixed.unavailable.terms", { workspace });
      default:
        return undefined;
    }
  };

  const fixedChoice = fixedWorkspace ? (mcpConsentStore.workspaces[0] ?? null) : null;
  const fixedName = fixedChoice ? workspaceDisplayName(fixedChoice.name, t("Workspaces.fallbackName")) : "";
  const fixedRefusal = fixedChoice
    ? fixedUnavailableMessage(fixedChoice, fixedName)
    : t("McpConsentWorkspace.fixed.notMember");
  const title = fixedWorkspace
    ? fixedChoice?.name?.trim()
      ? t("McpConsentWorkspace.titleNamed", { client: clientName, workspace: fixedChoice.name.trim() })
      : t("McpConsentWorkspace.title", { client: clientName })
    : t("McpConsentWorkspace.accountTitle", { client: clientName });

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader subtitle={t("McpConsentCard.subtitle", { client: clientName })} title={title} />

      <AppCardBody>
        <p className="text-x-sm">{t("McpConsentCard.body", { client: clientName })}</p>

        {fixedChoice ? (
          <div className={ROW_CLASS} id={`mcp-consent-fixed-workspace-${fixedChoice.companyId}`}>
            <WorkspaceAvatar companyId={fixedChoice.companyId} name={fixedName} size="sm" />

            <span className="truncate text-sm font-medium text-foreground">{fixedName}</span>

            {fixedChoice.unavailableReason ? (
              <span className="col-start-2 text-xs font-normal leading-relaxed text-muted-foreground">
                {unavailableLabel(fixedChoice.unavailableReason)}
              </span>
            ) : null}
          </div>
        ) : null}

        {fixedWorkspace ? null : (
          <section aria-labelledby="mcp-consent-workspaces-label" className="flex min-w-0 flex-col gap-2">
            <h2 className="text-muted-foreground text-xs leading-none font-normal" id="mcp-consent-workspaces-label">
              {t("McpConsentWorkspace.workspacesLabel")}
            </h2>

            <ul className="m-0 grid list-none gap-2 p-0">
              {mcpConsentStore.workspaces.map((workspace) => {
                const name = workspaceDisplayName(workspace.name, t("Workspaces.fallbackName"));
                const detail = unavailableLabel(workspace.unavailableReason) ?? workspace.roleName;

                return (
                  <li
                    key={workspace.companyId}
                    className={ROW_CLASS}
                    data-unavailable={workspace.unavailableReason ?? undefined}
                    id={`mcp-consent-workspace-${workspace.companyId}`}
                  >
                    <WorkspaceAvatar companyId={workspace.companyId} name={name} size="sm" />

                    <span className="truncate text-sm font-medium text-foreground">{name}</span>

                    {detail ? (
                      <span className="col-start-2 text-xs font-normal leading-relaxed text-muted-foreground">
                        {detail}
                      </span>
                    ) : null}
                  </li>
                );
              })}

              <li className={ROW_CLASS} id="mcp-consent-new-workspaces">
                <span
                  aria-hidden
                  className="grid size-6 place-content-center rounded-full border border-dashed border-input text-muted-foreground"
                >
                  <Plus className="size-3.5" />
                </span>

                <span className="truncate text-sm font-medium text-foreground">
                  {t("McpConsentWorkspace.newWorkspaces")}
                </span>
              </li>
            </ul>
          </section>
        )}

        {fixedWorkspace
          ? fixedRefusal && <p className="text-x-sm text-destructive">{fixedRefusal}</p>
          : !canApprove && <p className="text-x-sm text-destructive">{t("McpConsentWorkspace.noneAvailable")}</p>}

        <ul className="text-x-sm text-subdued list-disc space-y-1 pl-5">
          <li>{t("McpConsentCard.access.crmData")}</li>

          <li>{t("McpConsentCard.access.messaging")}</li>

          {scopes.map((scope) => (
            <li key={scope}>{scopeLabel(scope)}</li>
          ))}
        </ul>

        {mcpConsentStore.termsOffered && !mcpConsentStore.termsRequired ? (
          <p className="text-x-xs text-subdued">
            {t("McpConsentWorkspace.termsForNewWorkspaces", { client: clientName })}
          </p>
        ) : null}

        {mcpConsentStore.termsOffered ? (
          <div className="flex items-center gap-2">
            <Checkbox
              aria-required={mcpConsentStore.termsRequired}
              checked={mcpConsentStore.termsAccepted}
              disabled={isSubmitting}
              id="mcp-consent-terms"
              onCheckedChange={(next) => mcpConsentStore.setTermsAccepted(next === true)}
            />

            <Label className="text-x-sm font-normal" htmlFor="mcp-consent-terms">
              <span>{t.rich("OnboardingForm.agreeToTerms", legalDocumentLinks)}</span>
            </Label>
          </div>
        ) : null}

        {fixedWorkspace ? (
          canApprove && (
            <p className="text-x-xs text-subdued">
              {t("McpConsentWorkspace.fixed.hint", { client: clientName, workspace: fixedName })}
            </p>
          )
        ) : (
          <p className="text-x-xs text-subdued">{t("McpConsentWorkspace.accountHint", { client: clientName })}</p>
        )}

        <p className="text-x-xs text-subdued">{t("McpConsentCard.destination", { host: redirectHost })}</p>
      </AppCardBody>

      <AppCardFooter>
        <Button disabled={isSubmitting} variant="secondary" onClick={() => runUserAction(() => decide(false))}>
          {t("McpConsentCard.deny")}
        </Button>

        {canApprove && (
          <Button disabled={!canSubmitApproval} onClick={() => runUserAction(() => decide(true))}>
            {t("McpConsentCard.approve")}
          </Button>
        )}
      </AppCardFooter>
    </AppCard>
  );
});

export const McpConsentCard = serverRenderedClient(McpConsentCardContent);
