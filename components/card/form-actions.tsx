"use client";

import type { BaseFormStore } from "@/core/base/base-form.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";

import { useAppForm } from "../forms/form-context";

import { AppCardFooter } from "./app-card-footer";

type Props = {
  store?: BaseFormStore | null;
  variant?: "card" | "topbar";
  formId?: string;
  primaryButtonLabel?: string;
  overrideDisabled?: boolean;
  showInitially?: boolean;
  anchorScope?: string;
};

export const FormActions = observer(
  ({
    store: storeProp,
    variant = "card",
    formId,
    primaryButtonLabel = "Common.actions.save",
    overrideDisabled,
    showInitially,
    anchorScope,
  }: Props) => {
    const t = useTranslations();
    const ctxStore = useAppForm();
    const store = storeProp ?? ctxStore;

    const dirty = store?.hasUnsavedChanges ?? false;
    const loading = store?.isLoading ?? false;
    const canManage = store?.canManage ?? true;
    const disabled = !dirty || Boolean(overrideDisabled) || (store?.isDisabled ?? loading);

    const isTopBar = variant === "topbar";
    const buttonSize = isTopBar ? "sm" : undefined;
    const buttonClassName = isTopBar ? "h-8" : undefined;

    if (!canManage) return null;

    const buttons = (
      <>
        {dirty && (
          <Button
            className={buttonClassName}
            id={anchorScope ? `${anchorScope}-reset` : undefined}
            size={buttonSize}
            type="button"
            variant="secondary"
            onClick={() => store?.resetForm()}
          >
            {t("Common.actions.reset")}
          </Button>
        )}

        <Button
          className={buttonClassName}
          disabled={disabled}
          form={formId}
          id={anchorScope ? `${anchorScope}-save` : undefined}
          size={buttonSize}
          type="submit"
          variant="default"
        >
          {t(primaryButtonLabel)}
        </Button>
      </>
    );

    if (isTopBar) return <div className="flex shrink-0 items-center gap-1">{buttons}</div>;

    const shouldShow = Boolean(showInitially) || dirty || loading;
    return (
      <Reveal className="shrink-0" show={shouldShow}>
        <AppCardFooter>{buttons}</AppCardFooter>
      </Reveal>
    );
  },
);
