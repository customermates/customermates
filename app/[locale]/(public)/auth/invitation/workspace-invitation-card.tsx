"use client";

import type { ReactNode } from "react";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Status } from "@/generated/prisma";

import { joinedWorkspacePath } from "./joined-workspace-path";
import { joinWorkspaceAction } from "../actions";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { AppLink } from "@/components/shared/app-link";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { signOutWithOnboardingIntentAction } from "@/app/[locale]/actions";

type Props = {
  email: string;
  invitationIntent: string;
  inviterName: string;
  membershipStatus: Status | null;
  workspaceName: string | null;
};

export function WorkspaceInvitationCard({
  email,
  invitationIntent,
  inviterName,
  membershipStatus,
  workspaceName,
}: Props) {
  const t = useTranslations();
  const { appMode, workspacesStore } = useRootStore();
  const [pendingAction, setPendingAction] = useState<"join" | "signOut" | null>(null);

  async function handleJoin() {
    if (pendingAction) return;
    setPendingAction("join");
    let isNavigating = false;

    try {
      const result = await joinWorkspaceAction({ intent: invitationIntent });
      if (result.ok) {
        workspacesStore.enter(
          { companyId: result.data.companyId, name: workspaceName },
          joinedWorkspacePath(result.data),
        );
        isNavigating = true;
      } else toastZodErrorTree(result.error);
    } finally {
      if (!isNavigating) setPendingAction(null);
    }
  }

  async function handleSignOut() {
    if (pendingAction) return;
    setPendingAction("signOut");
    try {
      await signOutWithOnboardingIntentAction(invitationIntent);
    } catch (error) {
      setPendingAction(null);
      throw error;
    }
  }

  const workspace = workspaceName?.trim() ?? "";
  const named = Boolean(workspace);
  const content =
    membershipStatus === Status.active
      ? {
          title: named
            ? t("WorkspaceInvitation.member.titleNamed", { workspace })
            : t("WorkspaceInvitation.member.title"),
          body: t("WorkspaceInvitation.member.body"),
          action: t("WorkspaceInvitation.member.action"),
        }
      : membershipStatus === Status.pendingAuthorization
        ? {
            title: t("WorkspaceInvitation.pending.title"),
            body: named
              ? t("WorkspaceInvitation.pending.bodyNamed", { workspace })
              : t("WorkspaceInvitation.pending.body"),
            action: t("WorkspaceInvitation.pending.action"),
          }
        : membershipStatus === Status.inactive
          ? {
              title: t("WorkspaceInvitation.inactive.title"),
              body: named
                ? t("WorkspaceInvitation.inactive.bodyNamed", { workspace })
                : t("WorkspaceInvitation.inactive.body"),
              action: null,
            }
          : {
              title: named
                ? t("WorkspaceInvitation.join.titleNamed", { workspace })
                : t("WorkspaceInvitation.join.title"),
              body: t("WorkspaceInvitation.join.body"),
              action: t("WorkspaceInvitation.join.action"),
            };
  const showsTerms = appMode === "cloud" && membershipStatus === null;
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

  return (
    <AppCard className="max-w-md">
      <CardHeroHeader alt="" subtitle={t("InvitationCard.joinSubtitle", { email })} title={content.title} />

      <AppCardBody>
        <p className="text-center text-sm font-medium [overflow-wrap:anywhere]">
          {t("InvitationCard.inviter", { inviterName })}
        </p>

        <p className="text-x-sm text-center">{content.body}</p>
      </AppCardBody>

      <AppCardFooter className="flex-col gap-2">
        {content.action ? (
          <Button className="w-full" disabled={pendingAction !== null} onClick={() => runUserAction(handleJoin)}>
            {content.action}
          </Button>
        ) : null}

        <Button
          className="w-full"
          disabled={pendingAction !== null}
          variant={content.action ? "ghost" : "default"}
          onClick={() => runUserAction(handleSignOut)}
        >
          <LogOut aria-hidden className="size-4" />

          {t("WorkspaceInvitation.otherAccount")}
        </Button>

        {showsTerms ? (
          <p className="text-x-xs text-subdued mt-1 max-w-sm text-center">
            {t.rich("WorkspaceInvitation.join.terms", legalDocumentLinks)}
          </p>
        ) : null}
      </AppCardFooter>
    </AppCard>
  );
}
