"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormCheckbox } from "@/components/forms/form-checkbox";
import { AppForm } from "@/components/forms/form-context";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { FormInput } from "@/components/forms/form-input";
import { AppModal } from "@/components/modal";
import { AppLink } from "@/components/shared/app-link";
import { useRootStore } from "@/core/stores/root-store.provider";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/features/workspace/workspace.schema";

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

export const CreateWorkspaceModal = observer(() => {
  const t = useTranslations();
  const { appMode, createWorkspaceModalStore: store } = useRootStore();
  const cloud = appMode === "cloud";

  return (
    <AppModal store={store} title={t("Workspaces.create")}>
      <AppForm store={store}>
        <AppCard className="relative">
          <AppCardHeader>
            <h2 className="text-x-lg">{t("Workspaces.create")}</h2>
          </AppCardHeader>

          <AppCardBody className="pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]">
            <p className="text-x-sm text-subdued">{t("Workspaces.createDescription")}</p>

            <FormInput
              required
              autoComplete="off"
              id="name"
              inputId="create-workspace-name"
              label={t("Workspaces.nameLabel")}
              maxLength={WORKSPACE_NAME_MAX_LENGTH}
            />

            {cloud ? <p className="text-x-sm text-subdued">{t("Workspaces.billingNote")}</p> : null}

            {cloud ? (
              <FormCheckbox
                required
                id="agreeToTerms"
                inputId="create-workspace-terms"
                label={t.rich("OnboardingForm.agreeToTerms", legalDocumentLinks)}
              />
            ) : null}
          </AppCardBody>

          <UnsavedChangesBar creating anchorScope="create-workspace" saveLabel={t("Workspaces.create")} store={store} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
