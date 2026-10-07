"use client";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordField, RecordScalar } from "@/features/records/record-model.schema";

import { observer } from "mobx-react-lite";
import { toJS } from "mobx";
import { z } from "zod";
import { useTranslations } from "next-intl";

import { BaseFormStore } from "@/core/base/base-form.store";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordScalarSchema } from "@/features/records/record-model.schema";
import { recordInputValue } from "@/features/records/record-input-value";
import { scalarMatchesType } from "@/features/records/record-model-validation";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { RecordInputField } from "./record-input-field";

export type RecordFieldSaveOutcome = { saved: boolean; invalid?: string[] };

export class RecordFieldValueStore extends BaseFormStore<{ value: unknown }> {
  constructor(
    rootStore: RootStore,
    readonly field: RecordField,
    initialValue: unknown,
    private readonly save: (value: RecordScalar | null) => Promise<RecordFieldSaveOutcome>,
    private readonly done: () => void,
  ) {
    super(rootStore, { value: initialValue });
  }
  onSubmit = async () => this.apply(false);
  private invalidValueMessage() {
    const { getTranslation } = this.rootStore.localeStore;
    if (this.field.valueType === "email") return getTranslation("Common.errors.invalidEmail");
    if (this.field.valueType === "url") return getTranslation("Common.errors.invalidUrl");
    if (this.field.valueType === "phone") return getTranslation("RecordModel.invalidPhone");
    return getTranslation("RecordModel.invalidValue");
  }

  apply = async (clear: boolean) => {
    if (this.isReadOnly || this.isLoading) return;
    const value = clear ? null : recordInputValue(toJS(this.form.value), this.field);
    if (value !== null) {
      const parsed = RecordScalarSchema.safeParse(value);
      if (!parsed.success) {
        this.setError({ errors: [], properties: { value: z.treeifyError(parsed.error) } });
        return;
      }
      if (!scalarMatchesType(parsed.data, this.field.valueType, this.field.multiple)) {
        this.showInvalid([this.invalidValueMessage()]);
        return;
      }
    }
    this.setIsLoading(true);
    try {
      const outcome = await this.save(value);
      if (outcome.saved) this.done();
      else if (outcome.invalid?.length) this.showInvalid(outcome.invalid);
    } finally {
      this.setIsLoading(false);
    }
  };
  private showInvalid(errors: string[]) {
    const tree = { errors: [], properties: { value: { errors } } };
    this.setError(tree);
    toastZodErrorTree(tree);
  }
}

export const RecordFieldValueEditor = observer(function RecordFieldValueEditor({
  store,
  submitLabel,
  busy = false,
  saveOnDatePick = false,
}: {
  store: RecordFieldValueStore;
  submitLabel: string;
  busy?: boolean;
  saveOnDatePick?: boolean;
}) {
  const t = useTranslations();
  return (
    <AppForm store={store}>
      <div className="space-y-3">
        <RecordInputField
          field={store.field}
          id="value"
          onDatePicked={saveOnDatePick ? () => runUserAction(() => store.apply(false)) : undefined}
        />

        <div className="flex items-center gap-2">
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

          <Button
            disabled={
              store.isLoading ||
              busy ||
              !store.hasUnsavedChanges ||
              store.form.value === undefined ||
              store.form.value === ""
            }
            size="sm"
            type="submit"
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </AppForm>
  );
});
