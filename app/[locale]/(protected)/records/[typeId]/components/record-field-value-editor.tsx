"use client";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordFieldView, RecordScalar } from "@/features/records/record-model.schema";

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
import { RecordInputField } from "./record-input-field";

export class RecordFieldValueStore extends BaseFormStore<{ value: unknown }> {
  constructor(
    rootStore: RootStore,
    readonly field: RecordFieldView,
    initialValue: unknown,
    private readonly save: (value: RecordScalar | null) => Promise<boolean>,
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
    }
    this.setIsLoading(true);
    try {
      if (await this.save(value)) this.done();
    } finally {
      this.setIsLoading(false);
    }
  };
}

export const RecordFieldValueEditor = observer(function RecordFieldValueEditor({
  store,
  submitLabel,
  busy = false,
}: {
  store: RecordFieldValueStore;
  submitLabel: string;
  busy?: boolean;
}) {
  const t = useTranslations();
  return (
    <AppForm store={store}>
      <div className="space-y-3">
        <RecordInputField field={store.field} id="value" />

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
            disabled={store.isLoading || busy || store.form.value === undefined || store.form.value === ""}
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
