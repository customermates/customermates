"use client";

import type { FormEvent } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { AppModal } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { InfoRow } from "@/components/shared/info-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRootStore } from "@/core/stores/root-store.provider";

import { FormField, OperatorUsersActionNotice } from "../users/operator-users-ui";
import { updateOperatorEnterpriseAllowanceAction, type OperatorWorkspacesActionState } from "./actions";
import { ReasonTextarea } from "./reason-textarea";
import { WorkspaceSubscriptionForm } from "./workspace-subscription-form";

import type { HostedAiOperatorCompanyDto } from "@/ee/operator/operator.schema";

export const OperatorWorkspaceModal = observer(function OperatorWorkspaceModal() {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { operatorWorkspaceModalStore: store, operatorWorkspacesStore } = useRootStore();
  const workspace = store.form.workspace;
  const [operationId, setOperationId] = useState(() => globalThis.crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<OperatorWorkspacesActionState<HostedAiOperatorCompanyDto>>({ status: "idle" });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setState({ status: "idle" });

    startTransition(async () => {
      const next = await updateOperatorEnterpriseAllowanceAction(state, formData);
      setState(next);
      if (next.status === "success") {
        setOperationId(globalThis.crypto.randomUUID());
        form.reset();
        operatorWorkspacesStore.setQueryOptions({ forceRefresh: true });
      }
    });
  }

  return (
    <AppModal size="xl" store={store} title={t("OperatorWorkspaces.detail.title")}>
      {workspace ? (
        <div className="space-y-4">
          <AppCard>
            <AppCardHeader>
              <h2 className="text-x-lg grow">{workspace.workspaceLabel}</h2>
            </AppCardHeader>

            <AppCardBody>
              <InfoRow label={t("OperatorWorkspaces.columns.owner")}>{workspace.ownerEmail ?? "-"}</InfoRow>

              <InfoRow label={t("OperatorWorkspaces.detail.workspaceId")}>{workspace.id}</InfoRow>

              <InfoRow label={t("OperatorWorkspaces.columns.members")}>
                {t("OperatorWorkspaces.values.members", {
                  active: workspace.activeUserCount,
                  total: workspace.userCount,
                })}
              </InfoRow>

              <InfoRow label={t("OperatorWorkspaces.columns.createdAt")}>
                {intlStore.formatNumericalShortDateTime(workspace.createdAt)}
              </InfoRow>
            </AppCardBody>
          </AppCard>

          <Tabs className="gap-4" defaultValue="subscription">
            <TabsList variant="line">
              <TabsTrigger value="subscription">{t("OperatorWorkspaces.tabs.subscription")}</TabsTrigger>

              <TabsTrigger value="allowance">{t("OperatorWorkspaces.tabs.allowance")}</TabsTrigger>
            </TabsList>

            <TabsContent value="subscription">
              <WorkspaceSubscriptionForm
                owner={store.form.owner}
                onCorrected={() => operatorWorkspacesStore.setQueryOptions({ forceRefresh: true })}
              />
            </TabsContent>

            <TabsContent value="allowance">
              <AppCard>
                <AppCardHeader>
                  <h2 className="text-x-lg grow">{t("OperatorWorkspaces.allowance.title")}</h2>
                </AppCardHeader>

                <AppCardBody>
                  <Alert>
                    <AlertTitle>{t("OperatorWorkspaces.allowance.warningTitle")}</AlertTitle>

                    <AlertDescription>{t("OperatorWorkspaces.allowance.warningDescription")}</AlertDescription>
                  </Alert>

                  <form aria-busy={pending} className="space-y-4" method="post" onSubmit={onSubmit}>
                    <input name="companyId" type="hidden" value={workspace.id} />

                    <input name="operationId" type="hidden" value={operationId} />

                    <FormField id="operatorWorkspaceAllowance" label={t("OperatorWorkspaces.allowance.label")}>
                      <Input
                        required
                        defaultValue={workspace.enterpriseCreditsPerUser ?? ""}
                        disabled={pending}
                        id="operatorWorkspaceAllowance"
                        max={1000000}
                        min={1}
                        name="creditsPerUser"
                        step={1}
                        type="number"
                      />
                    </FormField>

                    <ReasonTextarea disabled={pending} id="operatorWorkspaceAllowanceReason" />

                    <OperatorUsersActionNotice state={state} success={t("OperatorWorkspaces.allowance.success")} />

                    <Button disabled={pending} type="submit">
                      {pending ? <Spinner aria-label={t("OperatorUsers.states.saving")} size="sm" /> : null}

                      {t("OperatorWorkspaces.allowance.save")}
                    </Button>
                  </form>
                </AppCardBody>
              </AppCard>
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </AppModal>
  );
});
