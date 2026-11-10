"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { FormLabel } from "@/components/forms/form-label";
import { CopyableCode } from "@/components/shared/copyable-code";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { InviteByEmailForm } from "./invite-by-email-form";
import { TeamsNeedPlanPanel } from "@/app/components/upsell/teams-need-plan-panel";

export const CompanyInviteModal = observer(() => {
  const t = useTranslations();
  const [method, setMethod] = useState<"link" | "email">("link");

  const { companyInviteModalStore } = useRootStore();
  const intlStore = useHydratedIntlStore();

  const { form, isLoading } = companyInviteModalStore;

  function getDescription() {
    const baseDescription = t("CompanyInviteModal.description");

    if (!form.expiresAt || isLoading) return baseDescription;

    return `${baseDescription} ${t("CompanyInviteModal.expiresAt", {
      date: intlStore.formatDescriptiveShortDateTime(form.expiresAt),
    })}`;
  }

  return (
    <AppModal store={companyInviteModalStore} title={t("CompanyInviteModal.title")}>
      <AppCard>
        <AppCardHeader>
          <h2 className="text-x-lg grow">{t("CompanyInviteModal.title")}</h2>
        </AppCardHeader>

        <AppCardBody>
          {companyInviteModalStore.teamsNeedPlan ? (
            <TeamsNeedPlanPanel onNavigate={() => companyInviteModalStore.close()} />
          ) : (
            <SegmentedControl
              idPrefix="invite-modal"
              items={[
                { value: "link", label: t("OnboardingWizard.invite.tabs.link") },
                { value: "email", label: t("OnboardingWizard.invite.tabs.email") },
              ]}
              label={t("CompanyInviteModal.title")}
              value={method}
              onValueChange={setMethod}
            >
              <SegmentedControlPanel value="link">
                <div className="space-y-1.5">
                  <FormLabel>{t("CompanyInviteModal.label")}</FormLabel>

                  <CopyableCode
                    anchorId="invite-modal-copy-link"
                    disabled={isLoading}
                    id="invite-modal-link"
                    value={isLoading ? t("CompanyInviteModal.generating") : form.inviteLink}
                  />

                  <p className="text-subdued text-xs">{getDescription()}</p>
                </div>
              </SegmentedControlPanel>

              <SegmentedControlPanel value="email">
                <InviteByEmailForm />
              </SegmentedControlPanel>
            </SegmentedControl>
          )}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
