"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormSelect } from "@/components/forms/form-select";
import { FormTextarea } from "@/components/forms/form-textarea";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getProviderIcon, getProviderProfileUrl } from "@/ee/messaging/provider-icon";
import { formatChannelIdentifier } from "@/ee/messaging/thread-display";

import { AppModal } from "@/components/modal/app-modal";

export const StartChatModal = observer(() => {
  const t = useTranslations();
  const { startChatModalStore: store } = useRootStore();
  const { form, isLoading, isEmail, accountsForProvider, showCcBcc } = store;

  const provider = form.provider;
  const ProviderIcon = provider ? getProviderIcon(provider) : null;
  const providerLabel = provider ? t(`Common.providers.${provider}`) : "";
  const recipientHandle = provider
    ? (getProviderProfileUrl(provider, form.recipientIdentifier) ??
      formatChannelIdentifier(provider, form.recipientIdentifier))
    : form.recipientIdentifier;
  const recipientName = form.recipientDisplayName?.trim() || recipientHandle;
  const title = t("EntityChannels.startChat.title", {
    provider: providerLabel,
  });

  const accountItems = accountsForProvider.map((account) => ({
    value: account.id,
    label: `${account.displayName ?? account.id}${account.emailAddress ? ` · ${account.emailAddress}` : ""}`,
  }));

  return (
    <AppModal size="md" store={store} title={title}>
      <AppForm store={store}>
        <AppCard>
          <AppCardHeader>
            <div className="flex w-full min-w-0 items-center gap-3">
              {ProviderIcon && (
                <span className="bg-foreground/10 dark:bg-foreground/15 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full">
                  <ProviderIcon className="size-8" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-[11px] font-medium">{providerLabel}</p>

                <h2 className="truncate text-sm font-semibold">{recipientName}</h2>

                {form.recipientDisplayName && recipientHandle !== recipientName && (
                  <p className="text-muted-foreground truncate text-xs">{recipientHandle}</p>
                )}
              </div>
            </div>
          </AppCardHeader>

          <AppCardBody className="flex flex-col gap-3">
            {accountsForProvider.length === 0 && (
              <p className="text-destructive text-xs">
                {t("EntityChannels.startChat.noAccount", {
                  provider: providerLabel,
                })}
              </p>
            )}

            {accountsForProvider.length > 1 && (
              <FormSelect
                id="selectedAccountId"
                items={accountItems}
                label={t("EntityChannels.startChat.accountLabel")}
              />
            )}

            {isEmail && (
              <div className="flex flex-col gap-3">
                <div className="flex items-end gap-2">
                  <FormInput
                    containerClassName="flex-1"
                    id="subject"
                    label={t("EntityChannels.startChat.subjectLabel")}
                  />

                  <Button
                    className="text-muted-foreground shrink-0"
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={store.toggleCcBcc}
                  >
                    {t("EntityChannels.startChat.ccBccToggle")}
                  </Button>
                </div>

                {showCcBcc && (
                  <>
                    <FormInputChips arrayMode id="cc" label={t("EntityChannels.startChat.ccLabel")} />

                    <FormInputChips arrayMode id="bcc" label={t("EntityChannels.startChat.bccLabel")} />
                  </>
                )}
              </div>
            )}

            <FormTextarea className="min-h-32" id="body" label={t("EntityChannels.startChat.bodyLabel")} />
          </AppCardBody>

          <AppCardFooter>
            <Button disabled={isLoading} type="button" variant="outline" onClick={() => store.close()}>
              {t("EntityChannels.startChat.cancel")}
            </Button>

            <Button disabled={isLoading} type="submit">
              {isLoading ? t("EntityChannels.startChat.sending") : t("EntityChannels.startChat.send")}
            </Button>
          </AppCardFooter>
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
