"use client";

import type { RootStore } from "@/core/stores/root.store";
import type {
  RecordFieldView,
  RecordFileSummary,
  RecordMember,
  RecordScalar,
  RecordScalarInput,
} from "@/features/records/record-model.schema";

import { observer } from "mobx-react-lite";
import { toJS } from "mobx";
import { useId } from "react";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { cn } from "@/core/utils/cn";

import { BaseFormStore } from "@/core/base/base-form.store";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordScalarSchema } from "@/features/records/record-model.schema";
import { recordInputValue, recordWriteValue } from "@/features/records/record-input-value";
import { recordValueIssue } from "@/features/records/record-model-validation";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordInputField } from "./record-input-field";

export type RecordFieldSaveOutcome = { saved: boolean; invalid?: string[] };

export function recordValueIssueMessage(
  rootStore: RootStore,
  value: RecordScalar,
  field: RecordFieldView,
): string | null {
  const code = recordValueIssue(value, field);
  if (!code) return null;
  if (code === CustomErrorCode.recordOptionInvalid)
    return rootStore.localeStore.getTranslation("RecordModel.chooseOption");
  return rootStore.localeStore.getTranslation(`Common.errors.${code}`);
}

export class RecordFieldValueStore extends BaseFormStore<{ value: unknown }> {
  constructor(
    rootStore: RootStore,
    readonly field: RecordFieldView,
    initialValue: unknown,
    private readonly save: (value: RecordScalarInput | null) => Promise<RecordFieldSaveOutcome>,
    private readonly done: () => void,
  ) {
    super(rootStore, { value: initialValue });
  }
  onSubmit = async () => this.apply(false);
  apply = async (clear: boolean) => {
    if (this.isReadOnly || this.isLoading) return;
    const value = clear ? null : recordInputValue(toJS(this.form.value), this.field);
    if (value !== null) {
      const parsed = RecordScalarSchema.safeParse(value);
      if (!parsed.success) {
        this.setError({ errors: [], properties: { value: z.treeifyError(parsed.error) } });
        return;
      }
      const invalid = recordValueIssueMessage(this.rootStore, parsed.data, this.field);
      if (invalid) {
        this.showInvalid([invalid]);
        return;
      }
    }
    this.setIsLoading(true);
    try {
      const outcome = await this.save(clear ? null : recordWriteValue(toJS(this.form.value), this.field));
      if (outcome.saved) {
        this.onInitOrRefresh(toJS(this.form));
        this.done();
      } else if (outcome.invalid?.length) this.showInvalid(outcome.invalid);
    } finally {
      this.setIsLoading(false);
    }
  };
  private showInvalid(errors: string[]) {
    this.setError({ errors: [], properties: { value: { errors } } });
  }
}

const FLUSH_VALUE_TYPES: RecordFieldView["valueType"][] = [
  "richText",
  "select",
  "member",
  "date",
  "dateTime",
  "dateRange",
  "dateTimeRange",
];

export function editsFlush(field: Pick<RecordFieldView, "valueType" | "multiple">) {
  return FLUSH_VALUE_TYPES.includes(field.valueType) || (field.multiple && field.valueType !== "channels");
}

export const RecordFieldValueEditor = observer(function RecordFieldValueEditor({
  store,
  busy = false,
  saveOnDatePick = false,
  label = store.field.label,
  members,
  files,
  onCancel,
}: {
  store: RecordFieldValueStore;
  busy?: boolean;
  members?: RecordMember[];
  files?: RecordFileSummary[];
  saveOnDatePick?: boolean;
  label?: string | null;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const value = store.form.value;
  const inputId = useId();
  const flush = label === null && editsFlush(store.field);
  return (
    <AppForm store={store}>
      <div className={cn(!flush && "space-y-3")}>
        {label === null && (
          <label className="sr-only" htmlFor={inputId}>
            {store.field.label}
          </label>
        )}

        <RecordInputField
          field={store.field}
          files={files}
          flush={flush}
          id="value"
          inputId={inputId}
          label={label}
          members={members}
          onDatePicked={saveOnDatePick && !flush ? () => runUserAction(() => store.apply(false)) : undefined}
        />

        <div className={cn("flex items-center gap-2", flush && "border-t p-3")}>
          <Button
            disabled={store.field.required || store.isLoading || busy}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => runUserAction(() => store.apply(true))}
          >
            {t("MassActions.clearField")}
          </Button>

          <div className="grow" />

          <FormFooterActions
            dirty={store.hasUnsavedChanges && value !== undefined && value !== ""}
            placement="overlay"
            saving={store.isLoading || busy}
            store={store}
            onCancel={onCancel}
            onSave={() => store.apply(false)}
          />
        </div>
      </div>
    </AppForm>
  );
});
