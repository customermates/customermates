"use client";

import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, CalendarIcon, KeyRound, Trash2 } from "lucide-react";

import { AiConnectionFlow } from "@/components/ai-connection/ai-connection-flow";
import { Button } from "@/components/ui/button";
import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/core/utils/cn";
import { FormLabel } from "@/components/forms/form-label";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { Alert } from "@/components/shared/alert";
import { CopyableCode } from "@/components/shared/copyable-code";
import { Icon } from "@/components/shared/icon";
import { InfoRow } from "@/components/shared/info-row";

const ExpiresInPicker = observer(() => {
  const t = useTranslations();
  const { apiKeyModalStore, intlStore } = useRootStore();
  const { expiresAt } = apiKeyModalStore;

  const today = new Date();
  const max = new Date();
  max.setDate(max.getDate() + 364);

  return (
    <div className="space-y-1.5">
      <FormLabel htmlFor="expiresIn">{t("ApiKeyModal.expiresIn")}</FormLabel>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            className={cn("w-full justify-start text-left font-normal", !expiresAt && "text-muted-foreground")}
            disabled={apiKeyModalStore.isDisabled}
            id="expiresIn"
            type="button"
            variant="outline"
          >
            <CalendarIcon className="mr-2 size-4" />

            {expiresAt ? (
              intlStore.formatDescriptiveLongDate(expiresAt)
            ) : (
              <span>{t("ApiKeyModal.expiresInPlaceholder")}</span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            autoFocus
            disabled={(date) => date < today || date > max}
            mode="single"
            selected={expiresAt ?? undefined}
            onSelect={(next) => apiKeyModalStore.setExpiresAt(next ?? null)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
});

export const ApiKeyModal = observer(() => {
  const t = useTranslations();
  const { apiKeyModalStore, apiKeysStore, intlStore } = useRootStore();
  const { aiConnectionStore, createdKey, creationPath, isLoading, close, hasUnsavedChanges, mode, viewingKey } =
    apiKeyModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();

  const isView = mode === "view" && viewingKey !== null;
  const isPlain = mode === "create" && creationPath === "plain";
  const isWizard = mode === "create" && creationPath === "wizard";
  const standardOptionRef = useRef<HTMLButtonElement>(null);
  const previousCreationPath = useRef(creationPath);

  useEffect(() => {
    if (previousCreationPath.current === creationPath) return;

    if (creationPath === "plain") document.getElementById("name")?.focus();
    else if (previousCreationPath.current === "plain") standardOptionRef.current?.focus();

    previousCreationPath.current = creationPath;
  }, [creationPath]);

  const wizardTitle =
    aiConnectionStore.route.screen === "providers"
      ? t("ApiKeyModal.addTitle")
      : aiConnectionStore.route.screen === "claude"
        ? t("OnboardingWizard.ai.screen.claude.title")
        : aiConnectionStore.route.screen === "skip"
          ? t("OnboardingWizard.ai.screen.skip.title")
          : t("OnboardingWizard.ai.screen.setup.title", {
              provider: t(`OnboardingWizard.ai.choices.${aiConnectionStore.route.provider}`),
            });

  const title = isView
    ? viewingKey?.name || t("ApiKeysCard.unnamed")
    : isPlain || createdKey
      ? t("ApiKeyModal.title")
      : wizardTitle;

  const providerIntro = (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("ApiKeyModal.addDescription")}</p>

      <Button
        ref={standardOptionRef}
        className="h-auto w-full justify-start gap-3 whitespace-normal rounded-xl p-4 text-left"
        data-api-key-option="plain"
        type="button"
        variant="outline"
        onClick={apiKeyModalStore.choosePlain}
      >
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
        >
          <KeyRound className="size-5" />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-medium">{t("ApiKeyModal.standardTitle")}</span>

          <span className="text-xs font-normal text-muted-foreground">{t("ApiKeyModal.standardDescription")}</span>
        </span>

        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Button>

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t("ApiKeyModal.quickTitle")}</h3>

        <p className="text-xs text-muted-foreground">{t("ApiKeyModal.quickDescription")}</p>
      </div>
    </div>
  );

  return (
    <AppModal size="xl" store={apiKeyModalStore} title={title}>
      <AppForm store={apiKeyModalStore}>
        <AppCard>
          <AppCardHeader>
            <h2 className="mr-auto text-x-lg">{title}</h2>

            {isView && viewingKey ? (
              <Button
                size="icon"
                title="Delete"
                variant="destructive"
                onClick={() =>
                  showDeleteConfirmation(async () => {
                    await apiKeysStore.delete(viewingKey.id);
                    close();
                  }, viewingKey.name ?? undefined)
                }
              >
                <Icon icon={Trash2} />
              </Button>
            ) : null}
          </AppCardHeader>

          <AppCardBody>
            {isView && viewingKey ? (
              <div className="flex flex-col gap-2">
                <InfoRow label="Created at">{intlStore.formatNumericalShortDateTime(viewingKey.createdAt)}</InfoRow>

                {viewingKey.expiresAt ? (
                  <InfoRow label="Expires at">{intlStore.formatNumericalShortDateTime(viewingKey.expiresAt)}</InfoRow>
                ) : null}

                {viewingKey.lastRequest ? (
                  <InfoRow label="Last used">{intlStore.formatNumericalShortDateTime(viewingKey.lastRequest)}</InfoRow>
                ) : null}
              </div>
            ) : createdKey ? (
              <Alert hideIcon className="mb-4" color="success">
                <div className="flex flex-col gap-2">
                  <p className="text-x-md">{t("ApiKeyModal.keyCreated")}</p>

                  <CopyableCode value={createdKey} />

                  <p className="text-x-sm">{t("ApiKeyModal.keyWarning")}</p>
                </div>
              </Alert>
            ) : isPlain ? (
              <>
                <FormInput required id="name" />

                <ExpiresInPicker />
              </>
            ) : isWizard ? (
              <AiConnectionFlow
                backLabel={t("ApiKeyModal.backToOptions")}
                beforeProviders={providerIntro}
                store={aiConnectionStore}
                substepHeaderMode="dialog"
                onKeyCreated={apiKeyModalStore.refreshAfterQuickConnection}
              />
            ) : null}
          </AppCardBody>

          {isPlain && !createdKey ? (
            <AppCardFooter>
              <Button disabled={isLoading} type="button" variant="secondary" onClick={apiKeyModalStore.backToOptions}>
                <ArrowLeft aria-hidden />

                {t("Common.actions.back")}
              </Button>

              <Button disabled={isLoading || !hasUnsavedChanges} id="api-key-save" type="submit">
                {t("Common.actions.save")}
              </Button>
            </AppCardFooter>
          ) : null}

          {isWizard ? (
            <AppCardFooter>
              {aiConnectionStore.route.screen === "providers" ? (
                <Button disabled={aiConnectionStore.isCreating} variant="secondary" onClick={close}>
                  {t("Common.actions.cancel")}
                </Button>
              ) : (
                <Button
                  disabled={aiConnectionStore.isCreating}
                  type="button"
                  variant="secondary"
                  onClick={aiConnectionStore.backToProviders}
                >
                  <ArrowLeft aria-hidden />

                  {t("Common.actions.back")}
                </Button>
              )}

              {aiConnectionStore.route.screen !== "providers" ? (
                <Button disabled={!aiConnectionStore.canFinish} type="button" onClick={close}>
                  {t("ApiKeyModal.done")}
                </Button>
              ) : null}
            </AppCardFooter>
          ) : null}
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
