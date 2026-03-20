"use client";

import type { BaseModalStore } from "@/core/base/base-modal.store";

import { Button } from "@heroui/button";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { XReveal } from "../x-reveal";

import { ErrorIndicator } from "./error-indicator";
import { XCardFooter } from "./x-card-footer";
import { useErrorIndicator } from "./use-error-indicator";

type Props = {
  store: BaseModalStore;
  overrideDisabled?: boolean;
  primaryButtonLabel?: string;
};

export const XCardModalDefaultFooter = observer(
  ({ store, overrideDisabled, primaryButtonLabel = "Common.actions.save" }: Props) => {
    const t = useTranslations("");
    const showErrorIndicator = useErrorIndicator(store.error);

    const isDisabled = overrideDisabled || store.isDisabled;

    return (
      <XReveal show={store.hasUnsavedChanges || (store.hasUnsavedChanges && store.isLoading)}>
        <XCardFooter>
          {store.hasUnsavedChanges && (
            <Button color="danger" variant="bordered" onPress={store.resetForm}>
              {t("Common.actions.reset")}
            </Button>
          )}

          <Button
            color="primary"
            isDisabled={!store.hasUnsavedChanges || isDisabled}
            isLoading={store.isLoading}
            startContent={showErrorIndicator ? <ErrorIndicator /> : undefined}
            type="submit"
          >
            {t(primaryButtonLabel)}
          </Button>
        </XCardFooter>
      </XReveal>
    );
  },
);
