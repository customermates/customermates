"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Clipboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FormLabel } from "@/components/forms/form-label";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { runUserAction } from "@/core/errors/report-application-error";

import { InviteByEmailForm } from "./invite-by-email-form";

export const CompanyInviteModal = observer(() => {
  const t = useTranslations();

  const { companyInviteModalStore } = useRootStore();
  const intlStore = useHydratedIntlStore();

  const { form, isLoading } = companyInviteModalStore;
  const copy = useCopyToClipboard();

  function getDescription() {
    const baseDescription = t("CompanyInviteModal.description");

    if (!form.expiresAt || isLoading) return baseDescription;

    return `${baseDescription} ${t("CompanyInviteModal.expiresAt", {
      date: intlStore.formatDescriptiveShortDateTime(form.expiresAt),
    })}`;
  }

  const resolvedValue = isLoading ? t("CompanyInviteModal.generating") : form.inviteLink;

  return (
    <AppModal store={companyInviteModalStore} title={t("CompanyInviteModal.title")}>
      <AppCard>
        <AppCardHeader>
          <h2 className="text-x-lg grow">{t("CompanyInviteModal.title")}</h2>
        </AppCardHeader>

        <AppCardBody>
          <Tabs defaultValue="link">
            <TabsList>
              <TabsTrigger id="invite-modal-tab-link" value="link">
                {t("OnboardingWizard.invite.tabs.link")}
              </TabsTrigger>

              <TabsTrigger id="invite-modal-tab-email" value="email">
                {t("OnboardingWizard.invite.tabs.email")}
              </TabsTrigger>
            </TabsList>

            <TabsContent aria-labelledby="invite-modal-tab-link" className="mt-3" value="link">
              <div className="space-y-1.5">
                <FormLabel htmlFor="invite-modal-link">{t("CompanyInviteModal.label")}</FormLabel>

                <div className="flex gap-2 items-center">
                  <Input
                    readOnly
                    className="truncate"
                    disabled={isLoading}
                    id="invite-modal-link"
                    value={resolvedValue}
                  />

                  <Button
                    disabled={isLoading}
                    id="invite-modal-copy-link"
                    size="icon"
                    variant="ghost"
                    onClick={() => runUserAction(() => copy(form.inviteLink))}
                  >
                    <Icon icon={Clipboard} />
                  </Button>
                </div>

                <p className="text-subdued text-xs">{getDescription()}</p>
              </div>
            </TabsContent>

            <TabsContent aria-labelledby="invite-modal-tab-email" className="mt-3" value="email">
              <InviteByEmailForm />
            </TabsContent>
          </Tabs>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
