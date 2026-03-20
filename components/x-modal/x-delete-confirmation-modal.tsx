"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";

import { XForm } from "../x-inputs/x-form";

import { XModal } from "./x-modal";

import { XCardBody } from "@/components/x-card/x-card-body";
import { XCard } from "@/components/x-card/x-card";
import { XCardFooter } from "@/components/x-card/x-card-footer";
import { XCardHeader } from "@/components/x-card/x-card-header";
import { useRootStore } from "@/core/stores/root-store.provider";

export const XDeleteConfirmationModal = observer(() => {
  const t = useTranslations("Common");
  const { deleteConfirmationModalStore: store } = useRootStore();
  const { isLoading, form, close } = store;

  return (
    <XModal store={store}>
      <XForm store={store}>
        <XCard>
          <XCardHeader>
            <h2 className="text-x-lg">{form.title || t("deleteConfirmation.title")}</h2>
          </XCardHeader>

          <XCardBody>
            <p className="text-x-sm">{form.message || t("deleteConfirmation.message")}</p>
          </XCardBody>

          <XCardFooter>
            <Button isDisabled={isLoading} variant="flat" onPress={close}>
              {t("actions.cancel")}
            </Button>

            <Button color="danger" isLoading={isLoading} type="submit">
              {t("actions.delete")}
            </Button>
          </XCardFooter>
        </XCard>
      </XForm>
    </XModal>
  );
});
