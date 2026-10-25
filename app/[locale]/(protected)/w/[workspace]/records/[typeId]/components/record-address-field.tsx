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
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { FormFieldError } from "@/components/forms/form-field-error";
import { FormLabel } from "@/components/forms/form-label";
import { useFormFieldErrors } from "@/components/forms/use-form-field";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { DiscardChangesDialog } from "@/components/modal/confirm-dialog";
import { useRecordAddressSummary } from "@/components/records/use-record-address-lines";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";
import { addressDraftParts } from "@/features/records/record-input-value";

import { RecordAddressInput } from "./record-address-input";
import { RecordAddressDraftStore } from "./record-address-draft.store";

type Props = { field: RecordFieldView; id: string; inputId?: string; label?: string | null };

export const RecordAddressField = observer(function RecordAddressField({ field, id, inputId, label }: Props) {
  const t = useTranslations();
  const root = useRootStore();
  const parent = useAppForm();
  const locale = useHydratedIntlStore().formattingLocale;
  const [selection, setSelection] = useState<{ store: RecordAddressDraftStore; opener: HTMLElement } | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const summary = useRecordAddressSummary(addressDraftParts(parent?.getValue(id)), locale);
  const { hasError, message } = useFormFieldErrors(id);
  const title = t("RecordModel.editValue", { field: label ?? field.label });
  const domId = inputId ?? id;
  const close = () => {
    setConfirmingDiscard(false);
    setSelection(null);
  };
  const requestClose = () => {
    if (selection?.store.hasUnsavedChanges) setConfirmingDiscard(true);
    else close();
  };
  const apply = () => {
    if (!selection || !parent || parent.isDisabled) return;
    parent.onChange(id, toJS(selection.store.form.address));
    close();
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
          <Button
            aria-describedby={hasError ? `${domId}-error` : undefined}
            aria-invalid={hasError || undefined}
            aria-label={summary ? `${title}: ${summary}` : title}
            className="h-auto min-h-9 w-full justify-start py-1.5 text-left font-normal whitespace-normal"
            disabled={!parent || parent.isDisabled}
            id={domId}
            type="button"
            variant="field"
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
            <MapPin aria-hidden className="text-muted-foreground" />

            <span className={cn("line-clamp-2 min-w-0 flex-1 wrap-anywhere", !summary && "text-muted-foreground")}>
              {summary || t("RecordModel.addValue", { field: field.label })}
            </span>

            <ChevronRight aria-hidden className="size-3.5 text-muted-foreground" />
          </Button>
        </TooltipTrigger>

        {summary && <TooltipContent className="max-w-xs wrap-anywhere">{summary}</TooltipContent>}
      </Tooltip>

      {hasError && message && <FormFieldError id={`${domId}-error`}>{message}</FormFieldError>}

      {selection && (
        <AppModal
          guardsUnsavedChanges
          open
          sheet
          titleInContent
          focusReturnTarget={selection.opener}
          size="xl"
          title={title}
          onClose={requestClose}
        >
          <AppForm store={selection.store} onSubmit={apply}>
            <AppCard className="relative">
              <AppCardHeader>
                <AppModalTitle className="min-w-0 truncate text-lg font-semibold">{title}</AppModalTitle>
              </AppCardHeader>

              <AppCardBody className="pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]">
                <RecordAddressInput field={field} id="address" />
              </AppCardBody>

              <UnsavedChangesBar
                creating
                dirty={selection.store.hasUnsavedChanges}
                editable={!parent?.isDisabled}
                saveLabel={t("Common.actions.confirm")}
                saving={parent?.isDisabled}
                onSave={apply}
              />
            </AppCard>
          </AppForm>
        </AppModal>
      )}

      <DiscardChangesDialog open={confirmingDiscard} onCancel={() => setConfirmingDiscard(false)} onConfirm={close} />
    </div>
  );
});
