"use client";

import { useEffect } from "react";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordTriggerFields } from "@/components/records/record-trigger-fields";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { Button } from "@/components/ui/button";
import { getUsersAction } from "../../actions";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { PasswordInput } from "@/components/forms/password-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormCheckbox } from "@/components/forms/form-checkbox";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormActions } from "@/components/card/form-actions";
import { useRootStore } from "@/core/stores/root-store.provider";
import { WebhookCurrentEventSchema } from "@/features/webhook/webhook.schema";
import { AppChip } from "@/components/chip/app-chip";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { AppCardHeader } from "@/components/card/app-card-header";

const WEBHOOK_EVENTS = WebhookCurrentEventSchema.options.map((event) => ({ key: event }));

const HEADERS_PLACEHOLDER = "Authorization: Bearer your-token";
const BODY_TEMPLATE_PLACEHOLDER = '{"text": "{{event}} ({{id}})"}';

export const WebhookModal = observer(() => {
  const t = useTranslations();
  const { webhookModalStore, userStore } = useRootStore();
  const { form, canManage, isDisabled } = webhookModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();
  useEffect(() => {
    if (!webhookModalStore.isOpen) return;
    void webhookModalStore.loadRecordModel().catch(() => undefined);
    return webhookModalStore.cancelModelLoad;
  }, [webhookModalStore, webhookModalStore.isOpen]);

  return (
    <AppModal
      actions={
        form?.id && canManage
          ? [
              {
                id: "delete-webhook",
                anchorId: "webhook-modal-delete",
                label: t("Common.actions.delete"),
                icon: Trash2,
                variant: "destructive",
                disabled: isDisabled,
                onClick: () => showDeleteConfirmation(() => webhookModalStore.delete()),
              },
            ]
          : []
      }
      store={webhookModalStore}
      title={t("WebhookModal.title")}
    >
      <AppForm store={webhookModalStore}>
        <AppCard>
          <AppCardHeader>
            <h2 className="truncate text-x-lg">{t("WebhookModal.title")}</h2>
          </AppCardHeader>

          <AppCardBody>
            <div className="space-y-1.5">
              <FormInput required id="url" inputId="webhook-modal-url" type="url" />

              <p className="text-subdued text-xs">{t("WebhookModal.urlDescription")}</p>
            </div>

            <FormTextarea id="description" inputId="webhook-modal-description" />

            <FormAutocomplete
              required
              id="events"
              inputId="webhook-modal-events"
              items={WEBHOOK_EVENTS}
              renderValue={(items) =>
                items.map((item) => <AppChip key={item.key}>{t(`Common.events.${item.key}`)}</AppChip>)
              }
              selectionMode="multiple"
            >
              {(item) => <span>{t(`Common.events.${item.key}`)}</span>}
            </FormAutocomplete>

            {webhookModalStore.usesRecordTrigger && (
              <div className="space-y-4">
                {webhookModalStore.modelLoading && <p role="status">{t("Loading.text")}</p>}

                {webhookModalStore.modelLoadFailed && (
                  <div className="space-y-2" role="alert">
                    <p>{t("ErrorCard.title")}</p>

                    <Button
                      variant="secondary"
                      onClick={() => runUserAction(() => webhookModalStore.loadRecordModel())}
                    >
                      {t("ErrorCard.retry")}
                    </Button>
                  </div>
                )}

                {webhookModalStore.recordModel && (
                  <Button
                    disabled={webhookModalStore.modelLoading}
                    size="sm"
                    variant="ghost"
                    onClick={() => runUserAction(() => webhookModalStore.loadRecordModel())}
                  >
                    {t("Common.actions.refresh")}
                  </Button>
                )}

                {form.recordSources?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {form.recordSources.map((source, index) => (
                      <AppChip key={`${source.query.typeId}:${index}`}>
                        {webhookModalStore.recordModel?.types.find((type) => type.id === source.query.typeId)
                          ?.pluralLabel ?? t("RecordModel.records")}

                        {" · "}

                        {source.events.map((event) => t(`Common.events.${event}`)).join(", ")}
                      </AppChip>
                    ))}
                  </div>
                ) : (
                  <RecordTriggerFields allowAllTypes store={webhookModalStore} />
                )}

                <FormAutocompleteAvatar
                  getItems={getUsersAction}
                  id="recordOwnerUserId"
                  items={userStore.user ? [userStore.user] : []}
                  label={t("WebhookModal.recordOwner")}
                  placeholder={t("WebhookModal.currentUser")}
                  readOnly={!userStore.user?.role?.isSystemRole}
                />

                <p className="text-subdued text-xs">{t("WebhookModal.recordOwnerHelp")}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <PasswordInput
                id="secret"
                inputId="webhook-modal-secret"
                showPassword={webhookModalStore.showSecret}
                onToggleVisibility={webhookModalStore.toggleShowSecret}
              />

              <p className="text-subdued text-xs">{t("WebhookModal.secretDescription")}</p>
            </div>

            <div className="space-y-1.5">
              <FormTextarea id="headers" inputId="webhook-modal-headers" placeholder={HEADERS_PLACEHOLDER} rows={3} />

              <p className="text-subdued text-xs">{t("WebhookModal.headersDescription")}</p>
            </div>

            <div className="space-y-1.5">
              <FormTextarea
                id="bodyTemplate"
                inputId="webhook-modal-body-template"
                placeholder={BODY_TEMPLATE_PLACEHOLDER}
                rows={3}
              />

              <p className="text-subdued text-xs">{t("WebhookModal.bodyTemplateDescription")}</p>
            </div>

            <FormCheckbox id="enabled" inputId="webhook-modal-enabled" label={t("WebhookModal.enabled")} />
          </AppCardBody>

          <FormActions showInitially anchorScope="webhook-modal" store={webhookModalStore} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
