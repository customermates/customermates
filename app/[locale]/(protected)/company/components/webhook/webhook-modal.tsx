"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EyeIcon, EyeSlashIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";

import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XForm } from "@/components/x-inputs/x-form";
import { XInput } from "@/components/x-inputs/x-input";
import { XSelectItem } from "@/components/x-inputs/x-select-item";
import { XCheckbox } from "@/components/x-inputs/x-checkbox";
import { XCardModalDefaultFooter } from "@/components/x-card/x-card-modal-default-footer";
import { useRootStore } from "@/core/stores/root-store.provider";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { XChip } from "@/components/x-chip/x-chip";
import { XAutocomplete } from "@/components/x-inputs/x-autocomplete/x-autocomplete";
import { XIcon } from "@/components/x-icon";
import { useDeleteConfirmation } from "@/components/x-modal/hooks/x-use-delete-confirmation";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XTextarea } from "@/components/x-inputs/x-textarea";

const WEBHOOK_EVENTS = WebhookEventSchema.options.map((event) => ({ key: event }));

export const WebhookModal = observer(() => {
  const t = useTranslations("");
  const { webhookModalStore } = useRootStore();
  const { form, canManage, isDisabled } = webhookModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();

  return (
    <XModal store={webhookModalStore}>
      <XForm store={webhookModalStore}>
        <XCard>
          <XCardHeader>
            <div className="flex w-full justify-between items-center gap-3">
              <h2 className="text-x-lg">{t("WebhookModal.title")}</h2>

              {form?.id && canManage && (
                <Button
                  isIconOnly
                  color="danger"
                  isDisabled={isDisabled}
                  size="sm"
                  variant="flat"
                  onPress={() => showDeleteConfirmation(() => void webhookModalStore.delete())}
                >
                  <XIcon icon={TrashIcon} />
                </Button>
              )}
            </div>
          </XCardHeader>

          <XCardBody>
            <XInput isRequired description={t("WebhookModal.urlDescription")} id="url" type="url" />

            <XTextarea id="description" />

            <XAutocomplete
              isRequired
              id="events"
              items={WEBHOOK_EVENTS}
              renderValue={(items) =>
                items.map((item) => {
                  const [entity, action] = item.key.split(".");
                  return <XChip key={item.key}>{t(`Common.events.${entity}.${action}`)}</XChip>;
                })
              }
              selectionMode="multiple"
            >
              {(item) => {
                const [entity, action] = item.key.split(".");
                return XSelectItem({
                  key: item.key,
                  textValue: item.key,
                  children: t(`Common.events.${entity}.${action}`),
                });
              }}
            </XAutocomplete>

            <XInput
              description={t("WebhookModal.secretDescription")}
              endContent={
                <button tabIndex={-1} type="button" onClick={webhookModalStore.toggleShowSecret}>
                  <XIcon className="text-subdued" icon={webhookModalStore.showSecret ? EyeSlashIcon : EyeIcon} />
                </button>
              }
              id="secret"
              type={webhookModalStore.showSecret ? "text" : "password"}
            />

            <XCheckbox id="enabled">{t("WebhookModal.enabled")}</XCheckbox>
          </XCardBody>

          <XCardModalDefaultFooter store={webhookModalStore} />
        </XCard>
      </XForm>
    </XModal>
  );
});
