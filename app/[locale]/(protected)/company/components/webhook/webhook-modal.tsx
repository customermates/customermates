"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Trash2 } from "lucide-react";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormCheckbox } from "@/components/forms/form-checkbox";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormActions } from "@/components/card/form-actions";
import { useRootStore } from "@/core/stores/root-store.provider";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { AppChip } from "@/components/chip/app-chip";
import { Icon } from "@/components/shared/icon";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { AppCardHeader } from "@/components/card/app-card-header";

const WEBHOOK_EVENTS = WebhookEventSchema.options.map((event) => ({ key: event }));

export const WebhookModal = observer(() => {
  const t = useTranslations();
  const { webhookModalStore } = useRootStore();
  const { form, canManage, isDisabled } = webhookModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();

  return (
    <AppModal
      actions={
        form?.id && canManage
          ? [
              {
                id: "delete-webhook",
                label: t("Common.actions.delete"),
                icon: Trash2,
                variant: "destructive",
                disabled: isDisabled,
                onClick: () => showDeleteConfirmation(() => void webhookModalStore.delete()),
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
              <FormInput required id="url" type="url" />

              <p className="text-subdued text-xs">{t("WebhookModal.urlDescription")}</p>
            </div>

            <FormTextarea id="description" />

            <FormAutocomplete
              required
              id="events"
              items={WEBHOOK_EVENTS}
              renderValue={(items) =>
                items.map((item) => <AppChip key={item.key}>{t(`Common.events.${item.key}`)}</AppChip>)
              }
              selectionMode="multiple"
            >
              {(item) => <span>{t(`Common.events.${item.key}`)}</span>}
            </FormAutocomplete>

            <div className="space-y-1.5">
              <div className="relative">
                <FormInput id="secret" type={webhookModalStore.showSecret ? "text" : "password"} />

                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  tabIndex={-1}
                  type="button"
                  onClick={webhookModalStore.toggleShowSecret}
                >
                  <Icon className="text-subdued" icon={webhookModalStore.showSecret ? EyeOff : Eye} />
                </button>
              </div>

              <p className="text-subdued text-xs">{t("WebhookModal.secretDescription")}</p>
            </div>

            <FormCheckbox id="enabled" label={t("WebhookModal.enabled")} />
          </AppCardBody>

          <FormActions showInitially anchorScope="webhook-modal" store={webhookModalStore} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
