"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ClipboardIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { addToast } from "@heroui/toast";

import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XInput } from "@/components/x-inputs/x-input";
import { XIcon } from "@/components/x-icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XAlert } from "@/components/x-alert";

export const CompanyInviteModal = observer(() => {
  const t = useTranslations("");

  const { companyInviteModalStore, intlStore } = useRootStore();

  const { form, isLoading } = companyInviteModalStore;

  async function handleCopy() {
    if (form.isDisabled) return;

    try {
      await navigator.clipboard.writeText(form.inviteLink);
      addToast({
        description: t("Common.notifications.copiedToClipboard", {
          value: form.inviteLink,
        }),
        color: "success",
        icon: <XIcon icon={ClipboardIcon} size="sm" />,
      });
    } catch {
      addToast({
        description: t("Common.notifications.copyFailed"),
        color: "danger",
      });
    }
  }

  function getDescription() {
    const baseDescription = t("CompanyInviteModal.description");

    if (!form.expiresAt || isLoading) return baseDescription;

    return `${baseDescription} ${t("CompanyInviteModal.expiresAt", {
      date: intlStore.formatDescriptiveShortDateTime(form.expiresAt),
    })}`;
  }

  return (
    <XModal store={companyInviteModalStore}>
      <XCard>
        <XCardHeader>
          <h2 className="text-x-lg grow">{t("CompanyInviteModal.title")}</h2>
        </XCardHeader>

        <XCardBody>
          <XInput
            readOnly
            classNames={{ input: "truncate" }}
            description={getDescription()}
            endContent={
              <Button
                isIconOnly
                isDisabled={isLoading || form.isDisabled}
                size="sm"
                variant="light"
                onPress={() => void handleCopy()}
              >
                <XIcon icon={ClipboardIcon} />
              </Button>
            }
            id="inviteLink"
            isDisabled={isLoading || form.isDisabled}
            label={t("CompanyInviteModal.label")}
            value={
              form.isDisabled
                ? t("CompanyInviteModal.notAvailable")
                : isLoading
                  ? t("CompanyInviteModal.generating")
                  : form.inviteLink
            }
          />

          {form.isDisabled && (
            <XAlert color="warning">
              <p className="text-x-sm">{t("CompanyInviteModal.disabled")}</p>
            </XAlert>
          )}
        </XCardBody>

        <XCardFooter>
          <Button autoFocus variant="flat" onPress={() => companyInviteModalStore.close()}>
            {t("Common.actions.close")}
          </Button>
        </XCardFooter>
      </XCard>
    </XModal>
  );
});
