"use client";

import type { AddressDraft } from "@/features/records/record-input-value";
import type { RecordFieldView } from "@/features/records/record-model.schema";

import { useState } from "react";
import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronRight, MapPin } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppForm, useAppForm } from "@/components/forms/form-context";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { FormFieldError } from "@/components/forms/form-field-error";
import { FormLabel } from "@/components/forms/form-label";
import { useFormFieldErrors } from "@/components/forms/use-form-field";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { addressDraftParts } from "@/features/records/record-input-value";
import { addressCountryLabel } from "@/features/records/record-address-value";

import { RecordAddressInput } from "./record-address-input";
import { RecordAddressDraftStore } from "./record-address-draft.store";

type Props = { field: RecordFieldView; id: string; inputId?: string; label?: string | null };

export const RecordAddressField = observer(function RecordAddressField({ field, id, inputId, label }: Props) {
  const t = useTranslations();
  const root = useRootStore();
  const parent = useAppForm();
  const locale = useHydratedIntlStore().formattingLocale;
  const [selection, setSelection] = useState<{ store: RecordAddressDraftStore; opener: HTMLElement } | null>(null);
  const parts = addressDraftParts(parent?.getValue(id));
  const summary = [
    parts.street,
    parts.line2,
    [parts.postalCode, parts.city].filter(Boolean).join(" "),
    parts.region,
    parts.countryCode ? addressCountryLabel(parts.countryCode, locale) : null,
  ]
    .filter(Boolean)
    .join(", ");
  const { hasError, message } = useFormFieldErrors(id);
  const title = t("RecordModel.editValue", { field: label ?? field.label });
  const domId = inputId ?? id;
  const apply = () => {
    if (!selection || !parent || parent.isDisabled) return;
    parent.onChange(id, toJS(selection.store.form.address));
    setSelection(null);
  };
  return (
    <div className="space-y-1.5" data-address-field="">
      {label && (
        <FormLabel htmlFor={domId}>
          {label}

          {field.required && <span className="text-destructive"> *</span>}
        </FormLabel>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-describedby={hasError ? `${domId}-error` : undefined}
            aria-label={title}
            className="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-input-background px-3 py-1.5 text-left text-sm shadow-xs outline-none transition-colors hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-not-allowed data-invalid:border-destructive"
            data-invalid={hasError || undefined}
            disabled={!parent || parent.isDisabled}
            id={domId}
            type="button"
            onClick={(event) =>
              setSelection({
                store: new RecordAddressDraftStore(
                  root,
                  toJS(parent?.getValue(id)) as AddressDraft | undefined,
                  (path) => parent?.getError(`${id}${path.slice("address".length)}`),
                ),
                opener: event.currentTarget,
              })
            }
          >
            <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />

            <span className="line-clamp-2 min-w-0 flex-1 wrap-anywhere">
              {summary || t("RecordModel.addValue", { field: field.label })}
            </span>

            <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </TooltipTrigger>

        {summary && <TooltipContent className="max-w-xs wrap-anywhere">{summary}</TooltipContent>}
      </Tooltip>

      {hasError && message && <FormFieldError id={`${domId}-error`}>{message}</FormFieldError>}

      {selection && (
        <AppModal
          open
          sheet
          titleInContent
          focusReturnTarget={selection.opener}
          size="xl"
          title={title}
          onClose={() => setSelection(null)}
        >
          <AppForm store={selection.store} onSubmit={apply}>
            <AppCard>
              <AppCardHeader>
                <AppModalTitle>{title}</AppModalTitle>
              </AppCardHeader>

              <AppCardBody>
                <RecordAddressInput field={field} id="address" label={null} />
              </AppCardBody>

              <FormFooterActions
                creating
                dirty={selection.store.hasUnsavedChanges}
                editable={!parent?.isDisabled}
                saveLabel={t("Common.actions.confirm")}
                saving={parent?.isDisabled}
                store={null}
                onCancel={() => setSelection(null)}
                onSave={apply}
              />
            </AppCard>
          </AppForm>
        </AppModal>
      )}
    </div>
  );
});
