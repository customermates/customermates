"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ClipboardIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { addToast } from "@heroui/toast";
import { getLocalTimeZone, today } from "@internationalized/date";

import { XModal } from "@/components/x-modal/x-modal";
import { XCard } from "@/components/x-card/x-card";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XForm } from "@/components/x-inputs/x-form";
import { XInput } from "@/components/x-inputs/x-input";
import { XDatePicker } from "@/components/x-inputs/x-date-picker";
import { XCardModalDefaultFooter } from "@/components/x-card/x-card-modal-default-footer";
import { XIcon } from "@/components/x-icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XAlert } from "@/components/x-alert";

export const ApiKeyModal = observer(() => {
  const t = useTranslations("");
  const { apiKeyModalStore } = useRootStore();
  const { createdKey } = apiKeyModalStore;

  async function handleCopy() {
    if (!createdKey) return;

    try {
      await navigator.clipboard.writeText(createdKey);
      addToast({
        description: t("Common.notifications.copiedToClipboard", {
          value: createdKey,
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

  return (
    <XModal store={apiKeyModalStore}>
      <XForm store={apiKeyModalStore}>
        <XCard>
          <XCardHeader>
            <h2 className="text-x-lg">{t("ApiKeyModal.title")}</h2>
          </XCardHeader>

          <XCardBody>
            {createdKey ? (
              <XAlert hideIcon className="mb-4" color="success">
                <div className="flex flex-col gap-2">
                  <p className="text-x-md">{t("ApiKeyModal.keyCreated")}</p>

                  <div className="flex gap-2 items-center">
                    <code className="flex-1 bg-background px-3 py-2 rounded-lg text-sm break-all">{createdKey}</code>

                    <Button isIconOnly size="sm" variant="flat" onPress={() => void handleCopy()}>
                      <XIcon icon={ClipboardIcon} />
                    </Button>
                  </div>

                  <p className="text-x-sm">{t("ApiKeyModal.keyWarning")}</p>
                </div>
              </XAlert>
            ) : (
              <>
                <XInput isRequired id="name" />

                <XDatePicker
                  id="expiresIn"
                  maxValue={today(getLocalTimeZone()).add({ days: 364 })}
                  minValue={today(getLocalTimeZone())}
                  value={undefined}
                  onChange={(date) => {
                    let expiresIn = date
                      ? Math.ceil((date.toDate("UTC").getTime() - new Date().getTime()) / 1000)
                      : undefined;
                    if (expiresIn !== undefined) if (expiresIn <= 1) expiresIn = undefined;

                    apiKeyModalStore.onChange("expiresIn", expiresIn);
                  }}
                />
              </>
            )}
          </XCardBody>

          <XCardModalDefaultFooter store={apiKeyModalStore} />
        </XCard>
      </XForm>
    </XModal>
  );
});
