"use client";

import type { SubscriptionRecoveryPath } from "@/features/auth/subscription-recovery";
import type { CheckoutState } from "@/ee/subscription/checkout-state";
import type { WorkspaceDeleteRefusal } from "@/features/workspace/workspace-deletion-refusal";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { CardHeroHeader } from "@/components/card/card-hero-header";
import { useRootStore } from "@/core/stores/root-store.provider";

import { PlanSelection } from "@/app/[locale]/(protected)/settings/(workspace)/components/subscription/plan-selection";
import { supportMailHref } from "@/app/[locale]/(protected)/settings/(workspace)/components/subscription/support-mail-href";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { startBackgroundPoll } from "@/core/utils/background-poll";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { CHECKOUT_POLL_INTERVAL_MS } from "@/ee/subscription/checkout-state";
import { workspaceDisplayName } from "@/app/components/workspaces/workspace-identity";
import {
  DeleteWorkspaceButton,
  DeleteWorkspaceDialog,
  DeleteWorkspaceReason,
} from "@/app/components/workspaces/delete-workspace-dialog";

type Props = {
  recoveryPath: SubscriptionRecoveryPath;
  firstPlan: boolean;
  checkout: CheckoutState;
  deleteRefusal?: WorkspaceDeleteRefusal | null;
};

function currentDeleteRefusal(
  refusal: WorkspaceDeleteRefusal | null,
  checkout: CheckoutState,
): WorkspaceDeleteRefusal | null {
  if (refusal !== null && refusal !== "checkoutPending") return refusal;
  return checkout === "pending" ? "checkoutPending" : null;
}

const SubscriptionExpiredViewContent = observer(({ recoveryPath, firstPlan, checkout, deleteRefusal }: Props) => {
  const t = useTranslations();
  const { subscriptionExpiredStore, loadingOverlayStore, workspacesStore } = useRootStore();
  const workspaceName = workspaceDisplayName(workspacesStore.current?.name, t("Workspaces.fallbackName"));
  const selfServiceCheckout = recoveryPath === "selfServiceCheckout";
  const choosingFirstPlan = firstPlan && selfServiceCheckout;
  const checkoutState = subscriptionExpiredStore.checkout ?? checkout;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deletion = deleteRefusal === undefined ? undefined : currentDeleteRefusal(deleteRefusal, checkoutState);
  const awaitingPayment = selfServiceCheckout && checkoutState === "pending" && !subscriptionExpiredStore.activated;
  const description = selfServiceCheckout
    ? choosingFirstPlan
      ? t("Workspaces.firstPlan.description", { name: workspaceName })
      : t("SubscriptionExpiredView.selfServiceCheckoutDescription")
    : recoveryPath === "manualEnterpriseBilling"
      ? t("SubscriptionExpiredView.manualEnterpriseBillingDescription")
      : t("SubscriptionExpiredView.administratorRequiredDescription");

  useLayoutEffect(() => subscriptionExpiredStore.setCheckout(checkout), [checkout, subscriptionExpiredStore]);

  useEffect(() => {
    if (!awaitingPayment) return;
    return startBackgroundPoll({
      refresh: () => subscriptionExpiredStore.refreshCheckout(),
      onError: reportApplicationError,
      intervalMs: CHECKOUT_POLL_INTERVAL_MS,
    });
  }, [awaitingPayment, subscriptionExpiredStore]);

  return (
    <AppCard className="max-w-3xl">
      <CardHeroHeader
        subtitle={choosingFirstPlan ? t("Workspaces.firstPlan.subtitle") : t("SubscriptionExpiredView.subtitle")}
        title={
          choosingFirstPlan
            ? t("Workspaces.firstPlan.title", { name: workspaceName })
            : t("SubscriptionExpiredView.title")
        }
      />

      <AppCardBody>
        <p className="text-x-sm text-center text-subdued">{description}</p>

        {selfServiceCheckout ? (
          <PlanSelection
            checkout={checkoutState}
            isLoading={loadingOverlayStore.isLoading}
            onAbandon={() => runUserAction(() => subscriptionExpiredStore.handleAbandon())}
            onSelect={(plan) => runUserAction(() => subscriptionExpiredStore.handleSubscribe(plan))}
          />
        ) : null}
      </AppCardBody>

      <AppCardFooter className="flex-col gap-2">
        {!selfServiceCheckout ? (
          <Button className="w-full" onClick={() => window.location.reload()}>
            {t("SubscriptionExpiredView.retry")}
          </Button>
        ) : null}

        <Button
          className="w-full"
          variant="ghost"
          onClick={() => {
            const supportHref = supportMailHref(t("SubscriptionExpiredView.supportEmailSubject"));
            if (supportHref) window.location.href = supportHref;
          }}
        >
          {t("SubscriptionExpiredView.contactSupportCta")}
        </Button>

        {deletion === undefined ? null : (
          <div className="flex w-full flex-col items-center">
            <DeleteWorkspaceButton
              fullWidth
              id="subscription-expired-delete"
              refusal={deletion}
              size="default"
              variant="ghostDestructive"
              onClick={() => setConfirmingDelete(true)}
            />

            <DeleteWorkspaceReason className="mt-1 text-center" id="subscription-expired-delete" refusal={deletion} />
          </div>
        )}
      </AppCardFooter>

      {deletion === undefined ? null : (
        <DeleteWorkspaceDialog
          anchorScope="subscription-expired-delete-confirm"
          name={workspaceName}
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </AppCard>
  );
});

export const SubscriptionExpiredView = serverRenderedClient(SubscriptionExpiredViewContent);
