"use client";

import { Button } from "@heroui/button";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { useXForm } from "../x-inputs/x-form";
import { XReveal } from "../x-reveal";

import { ErrorIndicator } from "./error-indicator";
import { XCardFooter } from "./x-card-footer";
import { useErrorIndicator } from "./use-error-indicator";

type Props = {
  showInitially?: boolean;
};

export const XCardFormFooter = observer(({ showInitially = false }: Props) => {
  const t = useTranslations("");

  const store = useXForm();
  const showErrorIndicator = useErrorIndicator(store?.error);

  const shouldShow = showInitially || (store?.hasUnsavedChanges ?? false) || (store?.isLoading ?? false);

  return (
    <XReveal show={shouldShow}>
      <XCardFooter>
        {(store?.hasUnsavedChanges ?? false) && (
          <Button color="danger" variant="bordered" onPress={store?.resetForm}>
            {t("Common.actions.reset")}
          </Button>
        )}

        <Button
          color="primary"
          isDisabled={!store?.hasUnsavedChanges || store?.isLoading}
          isLoading={store?.isLoading}
          startContent={showErrorIndicator ? <ErrorIndicator /> : undefined}
          type="submit"
        >
          {t("Common.actions.save")}
        </Button>
      </XCardFooter>
    </XReveal>
  );
});
