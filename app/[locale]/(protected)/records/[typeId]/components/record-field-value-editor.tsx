"use client";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordFieldView, RecordMember, RecordScalar } from "@/features/records/record-model.schema";

import { observer } from "mobx-react-lite";
import { toJS } from "mobx";
import { z } from "zod";
import { useTranslations } from "next-intl";

import { BaseFormStore } from "@/core/base/base-form.store";
import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordScalarSchema } from "@/features/records/record-model.schema";
import { recordInputValue } from "@/features/records/record-input-value";
import { recordValueIssue } from "@/features/records/record-model-validation";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
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
    private readonly save: (value: RecordScalar | null) => Promise<RecordFieldSaveOutcome>,
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
  busy = false,
  saveOnDatePick = false,
  members,
  onCancel,
}: {
  store: RecordFieldValueStore;
  busy?: boolean;
  members?: RecordMember[];
  saveOnDatePick?: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const value = store.form.value;
  return (
    <AppForm store={store}>
      <div className="space-y-3">
        <RecordInputField
          field={store.field}
          id="value"
          members={members}
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
